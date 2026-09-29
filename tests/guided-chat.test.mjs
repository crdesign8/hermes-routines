import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

register('./stubs/sdk-loader.mjs', import.meta.url);
const sdk = await import('./stubs/sdk-stub.mjs');
// Exercised through the same generated artifact the Desktop loads, with the
// stubbed SDK face, so the contract is proven on shipped code.
const shapes = await import('../desktop/plugin.js');

function readSrcTree() {
  const base = path.join(root, 'src');
  const files = readdirSync(base, { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(String(f)));
  return files.map((f) => readFileSync(path.join(base, String(f)), 'utf8')).join('\n');
}

// The route is a distinct connection AND profile: a chat launched for a job
// on a remote connection must never be addressable as "the active profile".
const ROUTE = { connectionId: 'conn-remote', mode: 'remote', profile: 'work', targetProfile: 'work' };
const PROMPT = 'Configure the daily digest routine.';

function call(overrides = {}) {
  return shapes.openGuidedRoutineChat({ route: ROUTE, initialPrompt: PROMPT, ...overrides });
}

describe('guided-chat', () => {
  it('the SDK shim declares only the upstream session/composer doors this plugin uses', () => {
    const dts = readFileSync(path.join(root, 'src/types/plugin-sdk.d.ts'), 'utf8');
    assert.match(dts, /newChat/, 'host.newChat surface required');
    assert.match(dts, /composer/, 'host.composer surface required');
    // Speculative symbols are the failure mode this shim exists to prevent:
    // the host builds its runtime import shim from the live module namespace,
    // so an export that does not exist upstream breaks the plugin at link time.
    // Comments are stripped first — the shim NAMES the verbs it declines to
    // declare, and prose is not a declaration.
    const declarations = dts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const absent of ['insertText', 'getDraft', 'openSession', 'openWorkspace', 'focus(']) {
      assert.equal(declarations.includes(absent), false, `${absent} must not be declared speculatively`);
    }
  });

  it('src reaches Desktop sessions only through host doors, never app DOM', () => {
    const src = readSrcTree();
    assert.match(src, /host\.newChat/, 'must use host.newChat');
    assert.match(src, /host\.composer\.setDraft/, 'must use host.composer.setDraft');
    // The catalog rule: no ProseMirror reach-in, no `[data-composer-target]`
    // lookup, no fiber/private-global inspection. (A plugin component's own
    // `listRef.querySelector` is its own subtree, not app chrome.)
    for (const banned of ['data-composer-target', '__reactFiber', 'ProseMirror', 'getSelection']) {
      assert.equal(src.includes(banned), false, `${banned} must not appear in src/`);
    }
  });

  it('openGuidedRoutineChat is exported from the shipped artifact', () => {
    assert.equal(typeof shapes.openGuidedRoutineChat, 'function');
    assert.equal(typeof shapes.GUIDED_CHAT_DRAFT, 'string');
  });

  it('seats the prompt in the fresh draft and leaves sending to the user by default', async () => {
    sdk.__reset();
    const result = await call();
    assert.equal(result.ok, true);
    assert.equal(result.autoSubmitted, false);
    assert.equal(result.routeKey, 'conn-remote::work');

    const doors = sdk.__calls().map((c) => c.door);
    assert.deepEqual(doors, ['newChat', 'composer.setDraft'], 'newChat then exactly one draft write');
    // The ROUTE (not a profile name) is the argument, and the fresh draft is
    // addressed by the literal 'new', never the active composer.
    assert.deepEqual(sdk.__calls()[0].args[0], ROUTE);
    assert.deepEqual(sdk.__calls()[1].args, ['new', PROMPT]);
  });

  it('autoSubmit sends through host.composer.submit after the draft is seated', async () => {
    sdk.__reset();
    const result = await call({ autoSubmit: true });
    assert.equal(result.ok, true);
    assert.equal(result.autoSubmitted, true);
    const calls = sdk.__calls();
    assert.deepEqual(calls.map((c) => c.door), ['newChat', 'composer.setDraft', 'composer.submit']);
    assert.deepEqual(calls[2].args, ['new', PROMPT]);
  });

  it('fails closed without a concrete route (no ambient-profile fallback)', async () => {
    sdk.__reset();
    for (const route of [null, undefined, {}, { profile: 'work' }, { connectionId: 'c1' }]) {
      const result = await call({ route });
      assert.equal(result.ok, false, `route ${JSON.stringify(route)} must not open a chat`);
      assert.equal(result.reason, 'no_route');
    }
    assert.deepEqual(sdk.__calls(), [], 'nothing may be opened on an unresolvable route');
  });

  it('fails closed on a blank prompt', async () => {
    sdk.__reset();
    for (const initialPrompt of ['', '   ', null, undefined, 42]) {
      const result = await call({ initialPrompt });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'blank_prompt');
    }
    assert.deepEqual(sdk.__calls(), [], 'a blank prompt must not open a chat');
  });

  it('fails closed when the host is older than the composer surface', async () => {
    sdk.__reset();
    sdk.__dropDoor('newChat');
    const noNewChat = await call();
    assert.equal(noNewChat.ok, false);
    assert.equal(noNewChat.reason, 'no_new_chat');
    sdk.__reset();

    sdk.__dropDoor('composer.setDraft');
    const noComposer = await call();
    assert.equal(noComposer.ok, false);
    assert.equal(noComposer.reason, 'no_composer');
    // Fail-closed BEFORE opening: a chat the plugin cannot seed is never
    // created, so the user is never left with an empty stranded window.
    assert.deepEqual(sdk.__calls(), [], 'no chat may be opened without a composer door');
    sdk.__reset();
  });

  it('reports a draft no mounted surface claimed instead of pretending it landed', async () => {
    sdk.__reset();
    sdk.__setComposerResult({ setDraft: false });
    const result = await call({ autoSubmit: true });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'draft_not_claimed');
    // Nothing was sent on a chat whose draft was never written.
    assert.equal(
      sdk.__calls().some((c) => c.door === 'composer.submit'),
      false,
    );
    sdk.__reset();
  });

  it('a refused submit keeps the seated draft and reports a retryable failure', async () => {
    sdk.__reset();
    sdk.__setComposerResult({ submit: false });
    const result = await call({ autoSubmit: true });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'submit_not_accepted');
    assert.deepEqual(sdk.__calls().map((c) => c.door), ['newChat', 'composer.setDraft', 'composer.submit']);
    sdk.__reset();
  });
});

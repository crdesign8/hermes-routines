import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function readRoot(...parts) {
  return readFileSync(path.join(root, ...parts), 'utf8');
}

// Public-readiness gate leftovers (issue #35): pin hygiene that would
// leak or become unsafe the moment the repository is public.
describe('public-readiness-contract (issue #35)', () => {
  it('gitignore excludes local audit dumps', () => {
    assert.match(readRoot('.gitignore'), /^reports\/$/m, '.gitignore must ignore reports/');
  });

  it('docs do not embed local machine paths', () => {
    const docsDir = path.join(root, 'docs');
    const files = readdirSync(docsDir).filter((name) => /\.(md|json)$/.test(name));
    for (const file of files) {
      const text = readFileSync(path.join(docsDir, file), 'utf8');
      assert.equal(text.includes('/home/hermes'), false, `${file} must not embed /home/hermes paths`);
      assert.equal(text.includes('/tmp/'), false, `${file} must not embed /tmp/ paths`);
    }
    for (const file of ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md']) {
      const text = readRoot(file);
      assert.equal(text.includes('/home/hermes'), false, `${file} must not embed /home/hermes paths`);
    }
  });
});

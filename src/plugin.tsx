import {
  PALETTE_AREA,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  STATUSBAR_AREAS,
  host,
  type HermesPlugin,
  type PaletteContribution,
  type PluginContext,
} from '@hermes/plugin-sdk';
import {
  COMMAND_NEW_ID,
  COMMAND_NEW_LABEL,
  COMMAND_OPEN_ID,
  COMMAND_OPEN_LABEL,
  PALETTE_NEW_ID,
  PALETTE_OPEN_ID,
  PLUGIN_ID,
  PLUGIN_NAME,
  ROUTE_ID,
  ROUTE_PATH,
  SIDEBAR_CODICON,
  SIDEBAR_ID,
  SIDEBAR_LABEL,
  SIDEBAR_ORDER,
  STATUS_ID,
  STATUS_ORDER,
} from './constants';
import { requestAttentionFocus, requestRoutineCreate } from './state/shellRequests';
import { RoutinesPage } from './views/RoutinesPage';
import { RoutinesStatusItem } from './views/RoutinesStatus';

export { RoutinesPage };

/**
 * Descriptor this plugin default-exports. `version` is an informational
 * release pin — the host reads id/name/register only — injected from
 * package.json at build time so the generated artifact can never drift
 * from the manifest (scripts/check-version.mjs fails on drift).
 */
export interface RoutinesPlugin extends HermesPlugin {
  version: string;
}

/** Open the page through the supported SDK navigation surface. */
export function openRoutines(): void {
  if (typeof host.navigate === 'function') {
    host.navigate(ROUTE_PATH);
  }
}

/**
 * Open the page with the creation flow pending. The request is parked for
 * the page before navigating, so it is honored whether the page is already
 * mounted or mounts as a result of the navigation.
 */
export function newRoutine(): void {
  requestRoutineCreate();
  if (typeof host.navigate === 'function') {
    host.navigate(ROUTE_PATH);
  }
}

/** Open the page focused on the attention slice (status-bar activation). */
export function openRoutineAttention(): void {
  requestAttentionFocus();
  if (typeof host.navigate === 'function') {
    host.navigate(ROUTE_PATH);
  }
}

/**
 * Mount: one ROUTES_AREA page, one SIDEBAR_NAV_AREA row, two palette rows
 * and one conditional status contribution. Never `panes` — this plugin must
 * not steal pane layout.
 *
 * Keybinds were evaluated and deliberately left out: opening the list and
 * starting a routine are infrequent, mouse-or-palette actions, and the
 * letter-chord namespace the kanban plugin established for its new-task
 * command leaves no obviously free, memorable chord worth claiming globally
 * for either command. Both commands stay one keystroke away through the
 * palette instead of taking a chord every user pays for.
 */
export function register(ctx: PluginContext): void {
  ctx.register({
    id: ROUTE_ID,
    area: ROUTES_AREA,
    data: { path: ROUTE_PATH },
    render: () => <RoutinesPage />,
  });
  ctx.register({
    id: SIDEBAR_ID,
    area: SIDEBAR_NAV_AREA,
    order: SIDEBAR_ORDER,
    data: { path: ROUTE_PATH, label: SIDEBAR_LABEL, codicon: SIDEBAR_CODICON },
  });
  ctx.register({
    id: PALETTE_OPEN_ID,
    area: PALETTE_AREA,
    data: {
      id: COMMAND_OPEN_ID,
      label: COMMAND_OPEN_LABEL,
      keywords: ['routines', 'open', 'schedules', 'cron'],
      run: openRoutines,
    } satisfies PaletteContribution,
  });
  ctx.register({
    id: PALETTE_NEW_ID,
    area: PALETTE_AREA,
    data: {
      id: COMMAND_NEW_ID,
      label: COMMAND_NEW_LABEL,
      keywords: ['routines', 'new', 'create', 'schedule', 'cron'],
      run: newRoutine,
    } satisfies PaletteContribution,
  });
  ctx.register({
    id: STATUS_ID,
    area: STATUSBAR_AREAS.right,
    order: STATUS_ORDER,
    render: () => <RoutinesStatusItem />,
  });
}

export const plugin: RoutinesPlugin = {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  description: 'Standalone Hermes Desktop plugin for managing scheduled routines',
  defaultEnabled: false,
  version: __PLUGIN_VERSION__,
  register,
};

export default plugin;

// Test/inspection surface: the host only reads the default export, while
// tests exercise the very bundle the Desktop loads. Everything below is
// reachable code, so nothing here is test-only logic.
export * from './constants';
export * from './domain/cronShapes';
export * from './domain/routing';
export * from './domain/destinations';
export * from './domain/jobs';
export * from './domain/provisional';
export * from './domain/guidedEnvelope';
export * from './domain/routineProposal';
export * from './domain/guidedWorkflow';
export * from './domain/present';
export * from './domain/attention';
export * from './domain/failureExplain';
export * from './gateway/cronGateway';
export * from './gateway/guidedChat';
export * from './gateway/guidedLaunch';
export * from './gateway/cronParams';
export * from './gateway/provisionalCreate';
export * from './gateway/proposalApply';
export * from './gateway/proposalConfirm';
export * from './lib/errors';
export * from './state/routinesState';
export * from './state/shellRequests';
export * from './domain/routineSchedule';
export * from './views/RoutineComposerPanel';
export * from './views/RunOutcome';
export * from './views/RoutineList';
export * from './views/RoutineCard';
export * from './views/RoutineInspectorPanel';
export * from './views/PanelNav';
export * from './views/GuidedRoutinePanel';
export * from './views/GuidedProposalReview';
export * from './views/FilterNav';
export * from './views/NativeSelect';
export * from './views/RoutineStates';
export * from './views/RoutinesStatus';

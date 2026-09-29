import { ROUTES_AREA, SIDEBAR_NAV_AREA, type HermesPlugin, type PluginContext } from '@hermes/plugin-sdk';
import {
  PLUGIN_ID,
  PLUGIN_NAME,
  ROUTE_ID,
  ROUTE_PATH,
  SIDEBAR_CODICON,
  SIDEBAR_ID,
  SIDEBAR_LABEL,
  SIDEBAR_ORDER,
} from './constants';
import { RoutinesPage } from './views/RoutinesPage';

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

/**
 * Single mount: one ROUTES_AREA page plus one SIDEBAR_NAV_AREA row. Never
 * `panes` — this plugin must not steal pane layout. The page renders
 * exactly once, through the route contribution's `render`; nothing renders
 * the descriptor a second time.
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
export * from './gateway/cronGateway';
export * from './gateway/guidedChat';
export * from './gateway/guidedLaunch';
export * from './gateway/cronParams';
export * from './gateway/provisionalCreate';
export * from './gateway/proposalApply';
export * from './gateway/proposalConfirm';
export * from './lib/errors';
export * from './state/routinesState';
export * from './domain/routineSchedule';
export * from './views/RoutineComposerPanel';
export * from './views/RoutineDetails';
export * from './views/RoutineInspectorPanel';
export * from './views/GuidedRoutinePanel';
export * from './views/GuidedProposalReview';
export * from './views/SelectField';

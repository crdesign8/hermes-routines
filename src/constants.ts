// Stable identity and surface constants for the Routines plugin.
// Declared once here and consumed by the registrations in src/plugin.tsx,
// so no literal id or path is ever repeated at a call site.

/** Plugin id — becomes the `plugin:<id>` source tag. */
export const PLUGIN_ID = 'hermes-routines';
/** Human name shown in Capabilities -> Plugins. */
export const PLUGIN_NAME = 'Routines';
/** Local id of the ROUTES_AREA page contribution (the host namespaces it). */
export const ROUTE_ID = 'routines';
/** Workspace path served by the page contribution. */
export const ROUTE_PATH = '/routines';
/** Local id of the SIDEBAR_NAV_AREA row contribution. */
export const SIDEBAR_ID = 'sidebar-nav';
/** Sort key of the sidebar row within its area (lower = earlier). */
export const SIDEBAR_ORDER = 50;
/** Sidebar row label. */
export const SIDEBAR_LABEL = 'Routines';
/** VS Code codicon id for the sidebar row. */
export const SIDEBAR_CODICON = 'history';
/** Local id of the palette contribution that opens the page. */
export const PALETTE_OPEN_ID = 'palette-open';
/** Local id of the palette contribution that starts the creation flow. */
export const PALETTE_NEW_ID = 'palette-new';
/** Local id of the conditional status-bar contribution. */
export const STATUS_ID = 'status';
/** Command id of the palette row that opens the page. */
export const COMMAND_OPEN_ID = 'routines.open';
/** Command id of the palette row that starts the creation flow. */
export const COMMAND_NEW_ID = 'routines.newRoutine';
/** Palette label for opening the page. */
export const COMMAND_OPEN_LABEL = 'Routines: Open';
/** Palette label for starting the creation flow. */
export const COMMAND_NEW_LABEL = 'Routines: New routine';
/** Sort key of the status item within its area (lower = earlier). */
export const STATUS_ORDER = 80;
/** How often the status contribution re-reads routine health (ms). */
export const STATUS_POLL_MS = 60000;

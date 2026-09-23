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

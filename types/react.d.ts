// Minimal React/jsx-runtime ambient types so `tsc --noEmit` can check
// desktop/routines.js without @types/react (zero-deps repo: no devDeps).
// Intentionally permissive (`any`): the static contract pins the SDK/host
// surface, not React internals. The view ships `jsx()` calls without JSX
// syntax (see scaffold test), so only the hooks + jsx-runtime factories
// used by routines.js are declared here.

declare module 'react' {
  export function useState(initial: any): [any, any];
  export function useEffect(effect: () => void | (() => void), deps?: any): void;
  export function useRef(initial: any): any;
  export function useCallback(fn: any, deps?: any): any;
  export function useMemo(factory: any, deps?: any): any;
}

declare module 'react/jsx-runtime' {
  export function jsx(type: any, props?: any, key?: any): any;
  export function jsxs(type: any, props?: any, key?: any): any;
  export const Fragment: any;
}

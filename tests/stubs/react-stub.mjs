let queue = [];

export function __presetStates(values) {
  queue = Array.isArray(values) ? values.slice() : [];
}

export function useState(init) {
  if (queue.length > 0) return queue.shift();
  const value = typeof init === 'function' ? init() : init;
  const set = () => {};
  return [value, set];
}

export function useEffect() {}

export function useRef(init) {
  return { current: init === undefined ? null : init };
}

export function useCallback(fn) {
  return fn;
}

export function useMemo(fn) {
  return typeof fn === 'function' ? fn() : fn;
}

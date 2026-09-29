let queue = [];

// Setter log: lets a test observe a state TRANSITION a stubbed component
// triggered, without giving the stub a re-renderer. Reads as what the
// component asked for, so an assertion is "the key press dispatched the
// close", not "the DOM changed" — the reactive layer's job, not this
// stub's.
let updates = [];

export function __stateUpdates() {
  return updates;
}

export function __resetStateUpdates() {
  updates = [];
}

export function __presetStates(values) {
  queue = Array.isArray(values) ? values.slice() : [];
}

export function useState(init) {
  if (queue.length > 0) {
    const [value, set] = queue.shift();
    // The setter a test supplied still runs — tests capture the value they
    // care about themselves — and the transition is logged on the side.
    return [value, (next) => {
      updates.push(next);
      set(next);
    }];
  }
  const value = typeof init === 'function' ? init() : init;
  const set = (next) => {
    updates.push(next);
  };
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

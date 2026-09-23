const impl = {
  profileRoutes: async () => [],
  requestProfile: async () => ({ jobs: [] }),
  request: async () => ({ jobs: [] }),
};

const calls = [];
const DOORS = ['profileRoutes', 'requestProfile', 'request'];

export const ROUTES_AREA = 'routes';
export const SIDEBAR_NAV_AREA = 'sidebar.nav';

// Mirrors the real SDK host face. Doors are recording wrappers around the
// configurable `impl`; __dropDoor removes a door so fail-closed tests can
// exercise the bundle's `typeof host.X !== 'function'` guards against the
// same host shape a real (incomplete) host may present.
export const host = {};

function installDoor(name) {
  host[name] = (...args) => {
    calls.push({ door: name, args });
    return impl[name](...args);
  };
}

DOORS.forEach(installDoor);

export function __setHost(next) {
  Object.assign(impl, next);
}

export function __dropDoor(name) {
  delete host[name];
}

export function __calls() {
  return calls;
}

export function __reset() {
  calls.length = 0;
  for (const door of DOORS) {
    if (typeof host[door] !== 'function') installDoor(door);
  }
}

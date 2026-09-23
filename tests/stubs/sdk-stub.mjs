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

// Active-profile atoms: the reactive identity the page subscribes to via
// useValue(host.state.profile / host.state.connectionId). Tests drive
// profile switches through __setActive.
const active = { profile: 'p1', connectionId: 'c1' };

function makeAtom(getter) {
  return {
    get: getter,
    subscribe: () => () => {},
  };
}

host.state = {
  profile: makeAtom(() => active.profile),
  connectionId: makeAtom(() => active.connectionId),
};

export function useValue(atom) {
  return atom.get();
}

export function __setActive(profile, connectionId) {
  active.profile = profile;
  active.connectionId = connectionId;
}

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
  active.profile = 'p1';
  active.connectionId = 'c1';
  for (const door of DOORS) {
    if (typeof host[door] !== 'function') installDoor(door);
  }
  if (!host.state) {
    host.state = {
      profile: makeAtom(() => active.profile),
      connectionId: makeAtom(() => active.connectionId),
    };
  }
}

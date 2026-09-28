const impl = {
  profileRoutes: async () => [],
  requestProfile: async () => ({ jobs: [] }),
  request: async () => ({ jobs: [] }),
  newChat: () => undefined,
};

// Composer verbs are acknowledged through a per-verb result the tests
// steer: `false` reproduces the upstream fail-closed answer for an address
// no mounted surface owns (an empty string keys the wildcard).
const composerResult = { setDraft: true, submit: true };

const calls = [];
const DOORS = ['profileRoutes', 'requestProfile', 'request', 'newChat'];
const COMPOSER_DOORS = ['setDraft', 'submit'];

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

// Mirrors the upstream composer face: every verb is fail-closed on its
// address, so the stub answers through the steerable composerResult.
host.composer = {};
for (const verb of COMPOSER_DOORS) {
  host.composer[verb] = (...args) => {
    calls.push({ door: `composer.${verb}`, args });

    return verb === 'setDraft' ? Promise.resolve(composerResult.setDraft) : composerResult.submit;
  };
}

export function useValue(atom) {
  return atom.get();
}

export function __setActive(profile, connectionId) {
  active.profile = profile;
  active.connectionId = connectionId;
}

export function __setComposerResult(next) {
  Object.assign(composerResult, next);
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
  if (name.startsWith('composer.')) {
    delete host.composer[name.slice('composer.'.length)];

    return;
  }
  delete host[name];
}

export function __calls() {
  return calls;
}

export function __reset() {
  calls.length = 0;
  active.profile = 'p1';
  active.connectionId = 'c1';
  composerResult.setDraft = true;
  composerResult.submit = true;
  for (const door of DOORS) {
    if (typeof host[door] !== 'function') installDoor(door);
  }
  if (!host.composer) host.composer = {};
  for (const verb of COMPOSER_DOORS) {
    if (typeof host.composer[verb] !== 'function') {
      host.composer[verb] = (...args) => {
        calls.push({ door: `composer.${verb}`, args });

        return verb === 'setDraft' ? Promise.resolve(composerResult.setDraft) : composerResult.submit;
      };
    }
  }
  if (!host.state) {
    host.state = {
      profile: makeAtom(() => active.profile),
      connectionId: makeAtom(() => active.connectionId),
    };
  }
}

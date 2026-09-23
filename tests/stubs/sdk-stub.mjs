const impl = {
  profileRoutes: async () => [],
  requestProfile: async () => ({ jobs: [] }),
  request: async () => ({ jobs: [] }),
};

const calls = [];

export const ROUTES_AREA = 'routes';
export const SIDEBAR_NAV_AREA = 'sidebar.nav';

export const host = {
  profileRoutes: (...args) => {
    calls.push({ door: 'profileRoutes', args });
    return impl.profileRoutes(...args);
  },
  requestProfile: (...args) => {
    calls.push({ door: 'requestProfile', args });
    return impl.requestProfile(...args);
  },
  request: (...args) => {
    calls.push({ door: 'request', args });
    return impl.request(...args);
  },
};

export function __setHost(next) {
  Object.assign(impl, next);
}

export function __calls() {
  return calls;
}

export function __reset() {
  calls.length = 0;
}

export function definePlugin(def) {
  return { ...def };
}

import { asHostPrimitive } from './host-primitives.mjs';

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

// ---- Host UI kit (issue #100) -----------------------------------------
//
// Stubs for the primitives the plugin imports from the Desktop UI kit.
// These are NOT identity functions: each renders the ELEMENT the real
// upstream component renders, so a test walking the stub tree keeps seeing
// `type === 'button'` / `'input'` / `'textarea'` for host controls and can
// still find them by their real accessible props.
//
// What is deliberately NOT modelled: Radix's open/close portal, roving
// focus, and type-ahead (tests have no DOM to drive them with). The stub
// always renders the CLOSED select — the trigger plus the option list — so
// `SelectItem`s are assertable. Upstream renders the list only while open,
// which in a real browser is exactly one keypress or click away.
//
// `__reset` above restores host doors; these components are stateless and
// need no reset.

// Upstream Button: a <button type="button"> whose className is the cva
// variant/size output, carrying data-variant/data-size for a test to read.
export const Button = asHostPrimitive(function Button(props = {}) {
  const {
    variant = 'default',
    size,
    loading,
    disabled,
    className,
    children,
    ...rest
  } = props;
  return {
    type: 'button',
    props: {
      ...rest,
      type: 'button',
      className: className ?? `ui-button ui-button-${variant}${size ? ` ui-button-${size}` : ''}`,
      'data-slot': 'button',
      'data-variant': variant,
      ...(size ? { 'data-size': size } : {}),
      'aria-busy': loading || undefined,
      disabled: Boolean(disabled || loading),
      children,
    },
  };
});

// Upstream Input: a bare <input> carrying its own chrome (no wrapper unless
// prefix/suffix promote it to a group, which this plugin never uses).
export const Input = asHostPrimitive(function Input(props = {}) {
  const { size, prefix, suffix, containerClassName, className, children, ...rest } = props;
  if (prefix != null || suffix != null) {
    return {
      type: 'div',
      props: {
        className,
        'data-slot': 'input-group',
        children: [prefix, { type: 'input', props: { ...rest, 'data-slot': 'input' } }, suffix],
      },
    };
  }
  return {
    type: 'input',
    props: {
      ...rest,
      className,
      'data-slot': 'input',
      autoCapitalize: 'off',
      autoComplete: 'off',
      autoCorrect: 'off',
      spellCheck: false,
      children,
    },
  };
});

// Upstream Textarea: same chrome as Input plus the min-height floor.
export const Textarea = asHostPrimitive(function Textarea(props = {}) {
  const { size, className, children, ...rest } = props;
  return {
    type: 'textarea',
    props: {
      ...rest,
      className,
      'data-slot': 'textarea',
      autoCapitalize: 'off',
      autoComplete: 'off',
      autoCorrect: 'off',
      spellCheck: false,
      children,
    },
  };
});

// The Radix Select family. `Select` is a context provider upstream with no
// DOM of its own; here it injects that context into its own children, which
// is what React does at render time. Children arrive as already-created
// element objects (the JSX stub is eager), so the injection walks the tree
// and re-creates the nodes it changes — identity is irrelevant to a test.
function withSelectContext(node, context) {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((child) => withSelectContext(child, context));

  const isSelectItem = node.type === SelectItem || node.props?.['data-slot'] === 'select-item';
  const props = isSelectItem ? { ...node.props, __select: context } : node.props;

  const isContent = node.type === SelectContent || props?.['data-slot'] === 'select-content';
  const children = 'children' in props ? withSelectContext(props.children, context) : props.children;

  return { type: node.type, props: { ...props, children } };
}

export const Select = asHostPrimitive(function Select(props = {}) {
  const { value, defaultValue, onValueChange, disabled, children } = props;
  const active = value ?? defaultValue;
  return {
    type: 'ui-select',
    props: {
      value: active,
      disabled,
      __select: { value: active, onValueChange, disabled },
      children: withSelectContext(children, { value: active, onValueChange, disabled }),
    },
  };
});

export const SelectTrigger = asHostPrimitive(function SelectTrigger(props = {}) {
  const { size, className, children, ...rest } = props;
  return {
    type: 'button',
    props: {
      ...rest,
      type: 'button',
      role: 'combobox',
      'aria-haspopup': 'listbox',
      className: className ?? 'ui-select-trigger',
      'data-slot': 'select-trigger',
      children,
    },
  };
});

export const SelectValue = asHostPrimitive(function SelectValue(props = {}) {
  const { placeholder, __selectedLabel } = props;
  return { type: 'span', props: { 'data-slot': 'select-value', children: __selectedLabel ?? placeholder } };
});

export const SelectContent = asHostPrimitive(function SelectContent(props = {}) {
  return { type: 'ui-select-content', props: { 'data-slot': 'select-content', children: props.children } };
});

export const SelectItem = asHostPrimitive(function SelectItem(props = {}) {
  const { value, disabled, children, __select } = props;
  const selected = __select != null && __select.value === value;
  return {
    type: 'ui-select-item',
    props: {
      value,
      disabled,
      role: 'option',
      'aria-selected': selected,
      'data-slot': 'select-item',
      onClick: () => {
        if (!disabled && __select?.onValueChange) __select.onValueChange(value);
      },
      children,
    },
  };
});

export const Separator = asHostPrimitive(function Separator(props = {}) {
  const { orientation = 'horizontal', decorative = true, className } = props;
  return {
    type: 'ui-separator',
    props: {
      className: className ?? 'ui-separator',
      'data-slot': 'separator',
      orientation,
      decorative,
    },
  };
});

import { HOST_PRIMITIVE } from './host-primitives.mjs';

// The JSX runtime the plugin is built against, stubbed to plain objects:
// jsx(type, props) -> { type, props }, which is what every test walks.
//
// Host UI-kit primitives (Button/Input/Textarea/Select*/…) are the ONE case
// where a real React render and this stub disagree. In React, `<Button/>`
// becomes a single element; here the tag is a component function, so the
// naive `{type, props}` would keep the component node AND let a walker
// expand it later, double-counting every migrated control. Expanding tagged
// host primitives at element-creation time is what React already does, and
// it keeps every test's tree shaped like a real render.
function element(type, props) {
  if (typeof type === 'function' && type[HOST_PRIMITIVE] === true) {
    return type(props || {});
  }
  return { type, props: props || {} };
}

export function jsx(type, props) {
  return element(type, props);
}

export function jsxs(type, props) {
  return element(type, props);
}

export const Fragment = 'fragment';

// Shared marker for the host UI-kit primitives re-exported by the fake
// `@hermes/plugin-sdk` (see sdk-stub.mjs).
//
// Why the JSX stub needs it: a real React render turns `<Button/>` into ONE
// element. Without this marker the stub tree would hold BOTH the component
// node (`{type: Button, props}`) and whatever that component returns, so any
// test that counts nodes by className or by type would double-count every
// migrated control. Expanding host primitives HERE — at element creation,
// exactly where React would — keeps the stub tree shaped like a real
// render: host components are gone, only their element remains.
export const HOST_PRIMITIVE = Symbol.for('hermes-routines.host-primitive');

/**
 * Tag a stubbed host component so the JSX stub expands it eagerly.
 * @param {Function} component
 * @returns {Function} the same component, tagged
 */
export function asHostPrimitive(component) {
  Object.defineProperty(component, HOST_PRIMITIVE, { value: true });
  return component;
}

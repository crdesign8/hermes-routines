const base = new URL('./', import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier === '@hermes/plugin-sdk') {
    return { url: new URL('./sdk-stub.mjs', base).href, shortCircuit: true };
  }
  if (specifier === 'react') {
    return { url: new URL('./react-stub.mjs', base).href, shortCircuit: true };
  }
  if (specifier === 'react/jsx-runtime') {
    return { url: new URL('./jsx-stub.mjs', base).href, shortCircuit: true };
  }
  return next(specifier, context);
}

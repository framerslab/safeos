// Replace only the browser boundary; the check still serves a real HTTP request.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@playwright/test') {
    return { url: new URL('./offline-check-browser.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

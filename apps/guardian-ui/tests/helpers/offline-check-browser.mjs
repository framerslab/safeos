import vm from 'node:vm';

const page = {
  async goto(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Fixture page did not load');
  },
  evaluate(callback) {
    return vm.runInNewContext(`(${callback.toString()})()`, {
      navigator: { serviceWorker: {
        ready: new Promise(() => {}),
        getRegistration: async () => undefined,
      } },
      // Advance only the browser's deadline; the parent process has a real timeout.
      setTimeout: (callback, delay) => setTimeout(callback, Math.min(delay, 25)),
      clearTimeout,
    });
  },
};
export const chromium = {
  launch: async () => ({
    newContext: async () => ({ newPage: async () => page }),
    close: async () => { console.log('Browser closed'); },
  }),
};
export function expect() { throw new Error('Offline assertions must not run without a ready worker'); }

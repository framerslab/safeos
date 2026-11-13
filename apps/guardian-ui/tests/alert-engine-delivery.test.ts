/** @jest-environment jsdom */
import { IDBFactory } from 'fake-indexeddb';
require('fake-indexeddb/auto');
jest.setTimeout(60000);
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
type Save = (...args: any[]) => Promise<boolean>;

/**
 * One tab's alert engine: a fresh set of modules over the shared database and local storage.
 * `save` replaces only `cacheAlert`, and is given the real one to save with.
 */
async function engineTab(save?: (real: Save) => Save) {
  jest.resetModules();
  if (save) jest.doMock('@/lib/client-db', () => {
    const real = jest.requireActual('@/lib/client-db');
    return { ...real, cacheAlert: save(real.cacheAlert) };
  });
  const { localAlertEngine: engine } = await import('@/lib/local-alert-engine');
  const { getNotificationManager } = await import('@/lib/notification-manager');
  jest.dontMock('@/lib/client-db');
  const sound = jest.spyOn(engine, 'playAlertSound').mockResolvedValue(undefined);
  const notification = jest.spyOn(getNotificationManager(), 'show').mockResolvedValue(null as never);
  const listener = jest.fn();
  engine.onAlert(listener);
  return { engine, sound, notification, listener };
}
beforeEach(() => {
  jest.resetModules();
  global.indexedDB = new IDBFactory();
  localStorage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('delivers an alert while its save is held back', async () => {
  const { engine, sound, notification, listener } = await engineTab(() => () => new Promise<boolean>(() => {}));
  const alert = await Promise.race([
    engine.createAlert('motion', 'critical'),
    new Promise<'still waiting'>((resolve) => setTimeout(() => resolve('still waiting'), 500)),
  ]);
  expect(alert).toMatchObject({ type: 'motion', severity: 'critical' });
  expect(sound).toHaveBeenCalledWith('critical');
  expect(notification).toHaveBeenCalled();
  expect(listener).toHaveBeenCalledWith(alert);
});

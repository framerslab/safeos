/** @jest-environment jsdom */
import { openDB } from 'idb';
import { useAuthStore } from '@/stores/auth-store';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { cacheAlert, getCachedMonitoringAlerts, saveLocalSession } from '@/lib/client-db';
require('fake-indexeddb/auto');
Object.defineProperty(global, 'structuredClone', { configurable: true, value: (value: unknown) =>
  require('v8').deserialize(require('v8').serialize(value)),
});
const profile = { id: 'returning-person', displayName: 'Returning person' } as any;
async function reload() {
  const persisted = localStorage.getItem('safeos-auth')!;
  useAuthStore.setState({ profile: null, isInitialized: false });
  localStorage.setItem('safeos-auth', persisted);
  await useAuthStore.persist.rehydrate();
  useMonitoringStore.setState({ alerts: [] });
}
beforeEach(async () => {
  useAuthStore.setState({ profile: null, isInitialized: false });
  useMonitoringStore.setState({ alerts: [] });
  await saveLocalSession({ id: 'saved-session', token: 'saved-token', deviceId: null, profile,
    createdAt: '2026-10-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', syncedAt: null });
  const db = await openDB('safeos-guardian');
  await db.clear('alert_cache');
  db.close();
});
it('restores dashboard-owned alerts on Monitor reload', async () => {
  await useAuthStore.getState().initialize();
  useMonitoringStore.getState().addAlert({ id: 'saved', streamId: 'camera', severity: 'low',
    message: 'Saved', acknowledged: false });
  await useMonitoringStore.getState().hydrateAlerts();
  await reload();
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['saved']);
});
it('restores saved history on a direct History load before the dashboard', async () => {
  await cacheAlert({ id: 'history-direct', monitoring: true, ownerId: profile.id,
    createdAt: '2026-10-01T00:00:00Z', message: 'History direct' });
  await reload();
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['history-direct']);
  expect(useAuthStore.getState().profile?.id).toBe(profile.id);
});
it('keeps direct Monitor history when the dashboard later establishes the owner', async () => {
  useMonitoringStore.getState().addAlert({ id: 'direct', streamId: 'camera', severity: 'low',
    message: 'Direct', acknowledged: false });
  await useMonitoringStore.getState().hydrateAlerts();
  await useAuthStore.getState().initialize();
  await useMonitoringStore.getState().hydrateAlerts();
  expect(useMonitoringStore.getState().alerts.map(a => a.id)).toEqual(['direct']);
  expect(await getCachedMonitoringAlerts('someone-else')).toEqual([]);
});
it('claims unowned history once in a transaction when two known owners read together', async () => {
  await cacheAlert({ id: 'unowned', monitoring: true, createdAt: '2026-10-01T00:00:00Z' });
  const [first, second] = await Promise.all([
    getCachedMonitoringAlerts('first'), getCachedMonitoringAlerts('second'),
  ]);
  expect(first.map(a => a.id)).toEqual(['unowned']);
  expect(second).toEqual([]);
});

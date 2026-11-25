/** @jest-environment jsdom */

import { useAnimalAlertStore } from '@/stores/animal-alert-store';
import { useLostFoundStore } from '@/stores/lost-found-store';
import { useSecurityStore } from '@/stores/security-store';

it.each([
  ['People', useSecurityStore],
  ['Wildlife', useAnimalAlertStore],
  ['Lost and Found', useLostFoundStore],
] as const)('reads older %s settings without keeping the unused age limit', async (_way, store) => {
  const { name, version = 0 } = store.persist.getOptions();
  const settings = { ...store.getState().settings, maxStoredFrames: 80, autoDeleteDays: 1 };
  localStorage.setItem(name!, JSON.stringify({ state: { settings }, version }));

  await store.persist.rehydrate();

  expect(store.getState().settings.maxStoredFrames).toBe(80);
  expect(store.getState().settings).not.toHaveProperty('autoDeleteDays');
});

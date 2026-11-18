/** @jest-environment jsdom */
/**
 * The alert panel's screen-reader announcement
 *
 * A repeat of a continuing event updates its card in place, often with the
 * same reading and severity. The announcement names the repeat count, so its
 * text changes with each repeat and a screen reader reads it, also for a
 * person who has turned system notifications off.
 */
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { Alert } from '@/stores/monitoring-store';
import { FakeAudioContext, resetFakeAudio, settle } from './helpers/fake-audio';

require('fake-indexeddb/auto');

beforeEach(() => {
  jest.resetModules();
  // Keep the renderer's React instance while the sound module and stores are made afresh.
  jest.doMock('react', () => React);
  localStorage.clear();
  resetFakeAudio();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

it('announces each repeat of a card, also a repeat with the same reading and severity', async () => {
  const { AlertPanel } = await import('@/components/AlertPanel');
  const card: Alert = {
    id: 'motion-card',
    streamId: 'camera',
    severity: 'high',
    message: 'Motion detected: 75% (threshold: 20%)',
    createdAt: new Date().toISOString(),
    acknowledged: false,
  };
  const panel = (alert: Alert) => <AlertPanel alerts={[alert]} onAcknowledge={() => {}} />;

  const { rerender } = render(panel(card));
  await act(async () => { await settle(); });
  const first = screen.getByRole('status').textContent;
  expect(first).toContain('New high alert: Motion detected: 75% (threshold: 20%).');

  rerender(panel({ ...card, repeats: 1 }));
  await act(async () => { await settle(); });
  const second = screen.getByRole('status').textContent;
  expect(second).not.toBe(first);
  expect(second).toContain('Repeated 1 time.');

  rerender(panel({ ...card, repeats: 2 }));
  await act(async () => { await settle(); });
  expect(screen.getByRole('status').textContent).toContain('Repeated 2 times.');
});

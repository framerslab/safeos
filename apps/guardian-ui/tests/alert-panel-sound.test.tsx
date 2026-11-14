/** @jest-environment jsdom */
/**
 * The alert panel's sound at the top escalation level, played through the
 * real sound module on the stand-in Web Audio API.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Alert } from '@/stores/monitoring-store';
import {
  FakeAudioContext,
  audioSetup,
  lastStop,
  made,
  resetFakeAudio,
  runClock,
  settle,
  soundGains,
  started,
  through,
} from './helpers/fake-audio';

require('fake-indexeddb/auto');

type Modules = {
  AlertPanel: typeof import('@/components/AlertPanel').AlertPanel;
  getSoundManager: typeof import('@/lib/sound-manager').getSoundManager;
};

// A fresh sound module, with no audio context yet, for each case.
async function load(): Promise<Modules> {
  const { AlertPanel } = await import('@/components/AlertPanel');
  const { getSoundManager } = await import('@/lib/sound-manager');
  return { AlertPanel, getSoundManager };
}

// An unacknowledged alert old enough to be at the top escalation level.
const oldAlert = (id: string): Alert => ({
  id,
  streamId: 'camera',
  severity: 'critical',
  message: `Alert ${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  acknowledged: false,
});

// The panel with alerts it holds itself; acknowledging marks one acknowledged.
function Panel({ AlertPanel, initial }: { AlertPanel: Modules['AlertPanel']; initial: Alert[] }) {
  const [alerts, setAlerts] = React.useState(initial);
  const acknowledge = (id: string) =>
    setAlerts((current) => current.map((alert) => (alert.id === id ? { ...alert, acknowledged: true } : alert)));
  return <AlertPanel alerts={alerts} onAcknowledge={acknowledge} />;
}

beforeEach(() => {
  jest.resetModules();
  // Keep the renderer's React instance while the sound module and stores are made afresh.
  jest.doMock('react', () => React);
  jest.useFakeTimers();
  resetFakeAudio();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('two alerts that reach the top level in the same tick start one emergency loop, and acknowledging both leaves no sound and nothing scheduled', async () => {
  const { AlertPanel, getSoundManager } = await load();

  render(<Panel AlertPanel={AlertPanel} initial={[oldAlert('first'), oldAlert('second')]} />);
  await act(async () => { await settle(); });

  const loops = getSoundManager().getActiveSounds().filter((sound) => sound.loop);
  expect(loops.map((sound) => sound.type)).toEqual(['emergency']);
  expect(soundGains()).toHaveLength(1);

  const context = made.contexts[0];
  await act(async () => { await runClock(context, 1000); });
  expect(screen.getAllByRole('button', { name: 'Acknowledge' })).toHaveLength(2);
  while (screen.queryAllByRole('button', { name: 'Acknowledge' }).length > 0) {
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Acknowledge' })[0]); });
  }
  expect(getSoundManager().getActiveSounds()).toEqual([]);

  const acknowledgedAt = context.currentTime;
  const count = made.oscillators.length;
  await act(async () => { await runClock(context, 5000); });
  expect(made.oscillators).toHaveLength(count);
  // Every tone was stopped by the time both were acknowledged.
  expect(made.oscillators.map(lastStop).filter((time) => time > acknowledgedAt)).toEqual([]);
});

it('an emergency alert present before any gesture sounds once audio becomes available', async () => {
  // Before a gesture the context starts suspended and a browser that blocks audio leaves resume() pending.
  audioSetup.state = 'suspended';
  audioSetup.resume = () => new Promise<void>(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { AlertPanel } = await load();

  render(<Panel AlertPanel={AlertPanel} initial={[oldAlert('waiting')]} />);
  await act(async () => { await settle(); });
  expect(made.contexts).toHaveLength(1);
  const context = made.contexts[0];
  await act(async () => { await runClock(context, 3000); });
  expect(started()).toEqual([]);

  // A gesture elsewhere on the page lets the audio context run.
  await act(async () => {
    context.state = 'running';
    await runClock(context, 500);
  });

  // The emergency tones play through the panel's one sound.
  expect(started().length).toBeGreaterThan(0);
  expect(soundGains()).toHaveLength(1);
  const [gain] = soundGains();
  expect(gain.disconnected).toBe(false);
  expect(through(gain)).toEqual(started());
  expect(new Set(started().map((oscillator) => oscillator.type))).toEqual(new Set(['square']));
});

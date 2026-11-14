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
  useSettingsStore: typeof import('@/stores/settings-store').useSettingsStore;
};

// A fresh sound module, with no audio context yet, for each case.
async function load(): Promise<Modules> {
  const { AlertPanel } = await import('@/components/AlertPanel');
  const { getSoundManager } = await import('@/lib/sound-manager');
  const { useSettingsStore } = await import('@/stores/settings-store');
  return { AlertPanel, getSoundManager, useSettingsStore };
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

// Lets a case add an alert to the panel it rendered.
type Arrivals = { add?: (alert: Alert) => void };

// The panel with alerts it holds itself; acknowledging marks one acknowledged.
function Panel({ AlertPanel, initial, arrivals }: {
  AlertPanel: Modules['AlertPanel'];
  initial: Alert[];
  arrivals?: Arrivals;
}) {
  const [alerts, setAlerts] = React.useState(initial);
  if (arrivals) arrivals.add = (alert) => setAlerts((current) => [...current, alert]);
  const acknowledge = (id: string) =>
    setAlerts((current) => current.map((alert) => (alert.id === id ? { ...alert, acknowledged: true } : alert)));
  return <AlertPanel alerts={alerts} onAcknowledge={acknowledge} />;
}

beforeEach(() => {
  jest.resetModules();
  // Keep the renderer's React instance while the sound module and stores are made afresh.
  jest.doMock('react', () => React);
  jest.useFakeTimers();
  // The settings store saves itself; each case starts from the defaults.
  localStorage.clear();
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

it("an emergency alert present before any gesture sounds after the person's next click anywhere on the page", async () => {
  // As Chrome and Safari do: before a gesture the context is suspended, and
  // resume() goes through only when it is called after one.
  let gestureSeen = false;
  audioSetup.state = 'suspended';
  audioSetup.resume = (context) => {
    if (!gestureSeen) return new Promise<void>(() => {});
    context.state = 'running';
    return Promise.resolve();
  };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { AlertPanel } = await load();

  render(<Panel AlertPanel={AlertPanel} initial={[oldAlert('waiting')]} />);
  await act(async () => { await settle(); });
  expect(made.contexts).toHaveLength(1);
  const context = made.contexts[0];
  await act(async () => { await runClock(context, 3000); });
  expect(started()).toEqual([]);

  // The person clicks a part of the page that plays no sound.
  gestureSeen = true;
  await act(async () => {
    fireEvent.mouseDown(document.body);
    await runClock(context, 500);
  });

  // The context runs, and the emergency tones play through the panel's one sound.
  expect(context.state).toBe('running');
  expect(started().length).toBeGreaterThan(0);
  expect(soundGains()).toHaveLength(1);
  const [gain] = soundGains();
  expect(gain.disconnected).toBe(false);
  expect(through(gain)).toEqual(started());
  expect(new Set(started().map((oscillator) => oscillator.type))).toEqual(new Set(['square']));
});

it('the loop plays on as the same sound through an acknowledgement that leaves a top-level alert, an arrival, a volume change and a mute change; it stops with the last acknowledgement, and when the panel unmounts', async () => {
  const { AlertPanel, getSoundManager, useSettingsStore } = await load();
  const manager = getSoundManager();
  const play = jest.spyOn(manager, 'play');
  const stop = jest.spyOn(manager, 'stop');
  const arrivals: Arrivals = {};
  const loopIds = () => manager.getActiveSounds().filter((sound) => sound.loop).map((sound) => sound.id);

  render(<Panel AlertPanel={AlertPanel} initial={[oldAlert('first'), oldAlert('second')]} arrivals={arrivals} />);
  await act(async () => { await settle(); });
  expect(loopIds()).toHaveLength(1);
  const [loopId] = loopIds();
  const context = made.contexts[0];
  const [gain] = soundGains();
  await act(async () => { await runClock(context, 1000); });

  // One loop was started, it is the one that plays, and nothing stopped it.
  const sameLoopPlays = () => {
    expect(loopIds()).toEqual([loopId]);
    expect(play).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    expect(soundGains()).toEqual([gain]);
    expect(gain.disconnected).toBe(false);
  };
  const afterATick = async () => {
    await act(async () => { await runClock(context, 600); });
  };

  // One of the two is acknowledged; the other is at the top level.
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Acknowledge' })[0]); });
  sameLoopPlays();
  await afterATick();
  sameLoopPlays();

  // Another alert arrives at the top level.
  await act(async () => { arrivals.add?.(oldAlert('third')); });
  await afterATick();
  expect(screen.getAllByRole('button', { name: 'Acknowledge' })).toHaveLength(2);
  sameLoopPlays();

  // The volume setting changes.
  const volume = useSettingsStore.getState().getEffectiveVolume();
  await act(async () => { useSettingsStore.getState().updateGlobalSettings({ alertVolume: volume === 35 ? 45 : 35 }); });
  expect(useSettingsStore.getState().getEffectiveVolume()).not.toBe(volume);
  await afterATick();
  sameLoopPlays();

  // The panel's own mute, then the mute for the whole app.
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mute alerts' })); });
  await afterATick();
  sameLoopPlays();
  await act(async () => { useSettingsStore.getState().setGlobalMute(true); });
  await afterATick();
  sameLoopPlays();

  // The last top-level alerts are acknowledged: no sound is active.
  while (screen.queryAllByRole('button', { name: 'Acknowledge' }).length > 0) {
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Acknowledge' })[0]); });
  }
  expect(manager.getActiveSounds()).toEqual([]);
  expect(gain.disconnected).toBe(true);
  expect(stop.mock.calls).toEqual([[loopId]]);

  // A panel that unmounts with a top-level alert present stops its loop.
  cleanup();
  const second = render(<Panel AlertPanel={AlertPanel} initial={[oldAlert('fourth')]} />);
  await act(async () => { await settle(); });
  expect(loopIds()).toHaveLength(1);
  const secondGain = soundGains()[1];
  await act(async () => { await runClock(context, 1000); });
  expect(secondGain.disconnected).toBe(false);
  second.unmount();
  expect(manager.getActiveSounds()).toEqual([]);
  expect(secondGain.disconnected).toBe(true);
  const count = made.oscillators.length;
  await act(async () => { await runClock(context, 3000); });
  expect(made.oscillators).toHaveLength(count);
});

it('a change of the sound configured for the top level replaces the loop that plays: one stop, one start, and only the new sound is active', async () => {
  const { AlertPanel, getSoundManager, useSettingsStore } = await load();
  const manager = getSoundManager();
  const levels = useSettingsStore.getState().alertEscalationLevels;
  const top = Math.max(...levels.map((level) => level.level));
  // A notification fades out over 200 ms when it is stopped with its own fade.
  useSettingsStore.getState().updateAlertEscalationLevel(top, { soundType: 'notification' });
  const play = jest.spyOn(manager, 'play');
  const stop = jest.spyOn(manager, 'stop');
  const loops = () => manager.getActiveSounds().filter((sound) => sound.loop);

  render(<Panel AlertPanel={AlertPanel} initial={[oldAlert('first')]} />);
  await act(async () => { await settle(); });
  expect(loops().map((sound) => sound.type)).toEqual(['notification']);
  const [old] = loops();
  const context = made.contexts[0];
  const [oldGain] = soundGains();
  await act(async () => { await runClock(context, 1000); });
  expect(play).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();

  await act(async () => { useSettingsStore.getState().updateAlertEscalationLevel(top, { soundType: 'alarm' }); });

  // The two loops never sound together: the old one is gone when the new one starts.
  expect(manager.getActiveSounds().map((sound) => sound.type)).toEqual(['alarm']);
  expect(oldGain.disconnected).toBe(true);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(stop.mock.calls[0][0]).toBe(old.id);
  expect(play).toHaveBeenCalledTimes(2);
  expect(play.mock.calls[1][0]).toBe('alarm');
  const [replacement] = loops();

  // The new loop plays on, and nothing more is started or stopped.
  await act(async () => { await runClock(context, 2000); });
  expect(loops().map((sound) => sound.id)).toEqual([replacement.id]);
  expect(play).toHaveBeenCalledTimes(2);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(new Set(through(soundGains()[1]).map((oscillator) => oscillator.type))).toEqual(new Set(['triangle']));
});

it('a panel that unmounts ends its loop at once, also for a configured sound with a fade, so a panel mounted next plays the only loop', async () => {
  const { AlertPanel, getSoundManager, useSettingsStore } = await load();
  const manager = getSoundManager();
  const levels = useSettingsStore.getState().alertEscalationLevels;
  const top = Math.max(...levels.map((level) => level.level));
  // A notification fades out over 200 ms when it is stopped with its own fade.
  useSettingsStore.getState().updateAlertEscalationLevel(top, { soundType: 'notification' });
  const loops = () => manager.getActiveSounds().filter((sound) => sound.loop);

  const first = render(<Panel AlertPanel={AlertPanel} initial={[oldAlert('first')]} />);
  await act(async () => { await settle(); });
  expect(loops().map((sound) => sound.type)).toEqual(['notification']);
  const context = made.contexts[0];
  const [firstGain] = soundGains();
  await act(async () => { await runClock(context, 1000); });

  // Unmounted: the loop is gone at that moment, with no fade still running.
  first.unmount();
  expect(manager.getActiveSounds()).toEqual([]);
  expect(firstGain.disconnected).toBe(true);

  // A panel mounted straight after plays the only loop.
  render(<Panel AlertPanel={AlertPanel} initial={[oldAlert('second')]} />);
  await act(async () => { await settle(); });
  expect(loops()).toHaveLength(1);
  await act(async () => { await runClock(context, 1000); });
  expect(loops()).toHaveLength(1);
});

it('a loop whose audio context closes starts again on a new context at the next tick', async () => {
  const { AlertPanel, getSoundManager } = await load();
  const manager = getSoundManager();
  const loopIds = () => manager.getActiveSounds().filter((sound) => sound.loop).map((sound) => sound.id);

  render(<Panel AlertPanel={AlertPanel} initial={[oldAlert('first')]} />);
  await act(async () => { await settle(); });
  expect(made.contexts).toHaveLength(1);
  const context = made.contexts[0];
  const [closedId] = loopIds();
  await act(async () => { await runClock(context, 1000); });

  // The context closes; the panel's tick, every 500 ms, finds its loop gone.
  await act(async () => {
    await context.close();
    await runClock(context, 600);
  });

  expect(made.contexts).toHaveLength(2);
  const fresh = made.contexts[1];
  expect(loopIds()).toHaveLength(1);
  expect(loopIds()).not.toContain(closedId);
  await act(async () => { await runClock(fresh, 500); });
  const tones = started().filter((oscillator) => oscillator.context === fresh);
  expect(tones.length).toBeGreaterThan(0);
  expect(new Set(tones.map((oscillator) => oscillator.type))).toEqual(new Set(['square']));
});

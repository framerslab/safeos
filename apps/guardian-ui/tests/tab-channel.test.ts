/** @jest-environment jsdom */
/**
 * One tab tells the others
 *
 * Every open tab of the site shares one channel: a tab says when alerts
 * changed and when its watch starts and ends, and the device holds one watch
 * at a time. jsdom has no BroadcastChannel, so a stand-in carries the messages
 * the way a browser does (tests/helpers/tab-channel-stand-in). Each tab is the
 * module loaded afresh.
 */

import { act, renderHook } from '@testing-library/react';
import type * as TabChannel from '@/lib/tab-channel';
// The tab whose hook is rendered: the module as the rest of this file sees
// it, so the hook runs on the same React as renderHook. Only the last case
// uses it; every other tab is the module loaded afresh.
import { useOtherTabWatch } from '@/lib/tab-channel';
import { installTabChannel } from './helpers/tab-channel-stand-in';

type Tab = typeof TabChannel;

function openTab(): Tab {
  const loaded: Tab[] = [];
  jest.isolateModules(() => {
    loaded.push(require('../src/lib/tab-channel') as Tab);
  });
  return loaded[0];
}

/** What a promise has given so far. */
function settled<T>(promise: Promise<T>) {
  const seen: { done: boolean; value?: T } = { done: false };
  void promise.then((value) => {
    seen.done = true;
    seen.value = value;
  });
  return seen;
}

/** Moves the clock and lets every message on its way arrive. */
const run = (ms: number) => jest.advanceTimersByTimeAsync(ms);

/** What the tab that only listens has heard. */
let heard: TabChannel.TabMessage[];

const heardOf = (type: TabChannel.TabMessage['type']) => heard.filter((message) => message.type === type);

/** The channels open now, in the order they were made. */
let instances: () => BroadcastChannel[];

beforeEach(() => {
  jest.useFakeTimers();
  const channel = installTabChannel();
  instances = channel.instances;
  heard = channel.otherTab().heard as TabChannel.TabMessage[];
});

afterEach(() => {
  jest.useRealTimers();
  delete (globalThis as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;
  delete (document as unknown as { visibilityState?: string }).visibilityState;
});

it("tells the other tabs that alerts changed, and this tab's own listeners", async () => {
  const [a, b] = [openTab(), openTab()];
  const inA = jest.fn();
  const inB = jest.fn();
  a.onTabMessage(inA);
  b.onTabMessage(inB);

  a.alertsChanged();
  await run(0);

  expect(inA.mock.calls).toEqual([[{ type: 'alerts-changed' }]]);
  expect(inB.mock.calls).toEqual([[{ type: 'alerts-changed' }]]);
});

it('a tab that asks hears a watching tab answer', async () => {
  const [a, b] = [openTab(), openTab()];
  b.announceWatch('monitor', jest.fn());

  await expect(a.askOtherTabs()).resolves.toEqual({ watching: true, way: 'monitor' });
});

it('a watching tab does not answer itself', async () => {
  const b = openTab();
  b.announceWatch('monitor', jest.fn());

  const answer = settled(b.askOtherTabs());
  await run(300);

  expect(answer.value).toEqual({ watching: false });
});

it('a tab that gets no answer is told nothing is watching', async () => {
  const a = openTab();

  const answer = settled(a.askOtherTabs());
  await run(299);
  expect(answer.done).toBe(false);

  await run(1);
  expect(answer.value).toEqual({ watching: false });
});

it('a tab that starts answers before it asks for the camera', async () => {
  const [a, b] = [openTab(), openTab()];
  const release = b.claimWatch('monitor', jest.fn());

  await expect(a.askOtherTabs()).resolves.toEqual({ watching: true, way: 'monitor' });
  expect(heard).toContainEqual({ type: 'watch-started', way: 'monitor' });

  release();
  await run(0);
  expect(heard).toContainEqual({ type: 'watch-ended' });

  const answer = settled(a.askOtherTabs());
  await run(300);
  expect(answer.value).toEqual({ watching: false });
});

it('a tab that asks while another starts is told it watches', async () => {
  const [a, b] = [openTab(), openTab()];

  const answer = settled(a.askOtherTabs());
  await run(100);
  expect(answer.done).toBe(false);

  b.announceWatch('security', jest.fn());
  await run(0);

  expect(answer.value).toEqual({ watching: true, way: 'security' });
});

it("a watch takes over its tab's claim with no word between", async () => {
  const [a, b] = [openTab(), openTab()];
  const releaseClaim = b.claimWatch('monitor', jest.fn());
  const endWatch = b.announceWatch('monitor', jest.fn());
  releaseClaim();
  await run(0);

  expect(heardOf('watch-started')).toHaveLength(1);
  expect(heardOf('watch-ended')).toHaveLength(0);
  await expect(a.askOtherTabs()).resolves.toEqual({ watching: true, way: 'monitor' });

  endWatch();
  await run(0);
  expect(heardOf('watch-ended')).toHaveLength(1);
});

it('a watching tab stops when another tab takes over, and the taker waits for it', async () => {
  const [a, b] = [openTab(), openTab()];
  let endWatch: () => void = () => undefined;
  const stop = jest.fn(() => endWatch());
  endWatch = b.announceWatch('monitor', stop);

  const atTheAnswer = await a.takeOverWatch().then((taken) => ({
    taken,
    stops: stop.mock.calls.length,
    ended: heardOf('watch-ended').length,
  }));

  expect(atTheAnswer).toEqual({ taken: true, stops: 1, ended: 1 });
});

it('a start in another tab is stopped by a takeover', async () => {
  const [a, b] = [openTab(), openTab()];
  let release: () => void = () => undefined;
  const stop = jest.fn(() => release());
  release = b.claimWatch('monitor', stop);

  await expect(a.takeOverWatch()).resolves.toBe(true);
  expect(stop).toHaveBeenCalledTimes(1);
});

it('does not take over from a tab that keeps watching', async () => {
  const [a, b] = [openTab(), openTab()];
  const stop = jest.fn();
  b.announceWatch('monitor', stop);

  const taken = settled(a.takeOverWatch());
  await run(999);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(taken.done).toBe(false);

  await run(301);
  expect(taken.done).toBe(true);
  expect(taken.value).toBe(false);
});

it('takes over from a tab that was closed without a word', async () => {
  const [a, b] = [openTab(), openTab()];
  b.announceWatch('monitor', jest.fn());
  instances()[instances().length - 1].close();

  const taken = settled(a.takeOverWatch());
  await run(1299);
  expect(taken.done).toBe(false);

  await run(1);
  expect(taken.value).toBe(true);
});

it('of two tabs that press a start key together, one starts and the other is told a watch starts', async () => {
  const [a, b] = [openTab(), openTab()];

  const answers = [settled(a.askOtherTabs()), settled(b.askOtherTabs())];
  await run(300);

  expect(answers.every((answer) => answer.done)).toBe(true);
  expect(answers.map((answer) => answer.value?.watching).sort()).toEqual([false, true]);
});

it('a tab told none watches holds its start until its watch begins, and lets it go when the start ends', async () => {
  const [a, b] = [openTab(), openTab()];
  const mine = settled(a.askOtherTabs());
  await run(300);
  expect(mine.value).toEqual({ watching: false });

  // The start is on its way to the camera: a press in another tab is told.
  const meanwhile = settled(b.askOtherTabs());
  await run(300);
  expect(meanwhile.value).toEqual({ watching: true });

  a.releaseStart();
  await run(0);
  expect(heardOf('watch-ended')).toHaveLength(1);
  const after = settled(b.askOtherTabs());
  await run(300);
  expect(after.value).toEqual({ watching: false });
});

it('with no BroadcastChannel the tabs speak through local storage: a second start is told, and a takeover stops the first', async () => {
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, writable: true, value: undefined });
  // Local storage tells every other tab of a write, later than the write.
  const write = localStorage.setItem.bind(localStorage);
  const relay = jest.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
    write(key, value);
    void Promise.resolve().then(() => window.dispatchEvent(new StorageEvent('storage', { key, newValue: value })));
  });
  try {
    const [a, b] = [openTab(), openTab()];
    let endWatch: () => void = () => undefined;
    const stop = jest.fn(() => endWatch());
    endWatch = b.announceWatch('monitor', stop);

    await expect(a.askOtherTabs()).resolves.toEqual({ watching: true, way: 'monitor' });

    const taken = settled(a.takeOverWatch());
    await run(0);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(taken.value).toBe(true);
    await expect(a.askOtherTabs()).resolves.toEqual({ watching: false });
  } finally {
    relay.mockRestore();
    localStorage.clear();
  }
});

it('works in a browser with no channel', async () => {
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, writable: true, value: undefined });
  const tab = openTab();
  const listener = jest.fn();
  tab.onTabMessage(listener);

  tab.alertsChanged();
  expect(listener).toHaveBeenCalledWith({ type: 'alerts-changed' });

  await expect(tab.askOtherTabs()).resolves.toEqual({ watching: false });
  await expect(tab.takeOverWatch()).resolves.toBe(true);
  expect(() => tab.claimWatch('monitor', jest.fn())()).not.toThrow();
  expect(() => tab.announceWatch('security', jest.fn())()).not.toThrow();
});

it('a watching tab that is closed or reloaded tells the others its watch ended', async () => {
  const [a, b] = [openTab(), openTab()];
  b.claimWatch('monitor', jest.fn());
  const endWatch = b.announceWatch('monitor', jest.fn());
  await run(0);

  window.dispatchEvent(new Event('pagehide'));
  await run(0);
  expect(heardOf('watch-ended')).toHaveLength(1);

  const answer = settled(a.askOtherTabs());
  await run(300);
  expect(answer.value).toEqual({ watching: false });

  // The page's own end, if it still runs, says nothing more.
  endWatch();
  await run(0);
  expect(heardOf('watch-ended')).toHaveLength(1);
});

it('a tab that comes back into view asks again, so a watching tab closed with no word reads as not watching', async () => {
  const b = openTab();
  b.announceWatch('monitor', jest.fn());
  const bChannel = instances()[instances().length - 1];

  const { result } = renderHook(() => useOtherTabWatch());
  await act(() => run(300));
  expect(result.current).toBe(true);

  // The system ends tab B with no word, as a phone does with a tab in the background.
  bChannel.close();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await run(300);
  });

  expect(result.current).toBe(false);
});

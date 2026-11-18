/** @jest-environment jsdom */
/**
 * One tab tells the others
 *
 * Every open tab of the site shares one channel: a tab says when alerts
 * changed and when its watch starts and ends, and the device holds one watch
 * at a time. jsdom has no BroadcastChannel, so a stand-in carries the messages
 * the way a browser does: later than the post, to every other open channel of
 * the name and never to the sender. Each tab is the module loaded afresh.
 */

import type * as TabChannel from '@/lib/tab-channel';

type Tab = typeof TabChannel;

class ChannelStandIn {
  static instances: ChannelStandIn[] = [];

  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(readonly name: string) {
    ChannelStandIn.instances.push(this);
  }

  postMessage(message: unknown): void {
    if (!ChannelStandIn.instances.includes(this)) throw new Error('This channel is closed.');
    const others = ChannelStandIn.instances.filter((one) => one !== this && one.name === this.name);
    void Promise.resolve().then(() => {
      others
        .filter((one) => ChannelStandIn.instances.includes(one))
        .forEach((one) => one.onmessage?.({ data: JSON.parse(JSON.stringify(message)) }));
    });
  }

  close(): void {
    ChannelStandIn.instances = ChannelStandIn.instances.filter((one) => one !== this);
  }
}

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

beforeEach(() => {
  jest.useFakeTimers();
  ChannelStandIn.instances = [];
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, writable: true, value: ChannelStandIn });
  heard = [];
  new ChannelStandIn('safeos').onmessage = (event) => {
    heard.push(event.data as TabChannel.TabMessage);
  };
});

afterEach(() => {
  jest.useRealTimers();
  delete (globalThis as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;
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
  ChannelStandIn.instances[ChannelStandIn.instances.length - 1].close();

  const taken = settled(a.takeOverWatch());
  await run(1299);
  expect(taken.done).toBe(false);

  await run(1);
  expect(taken.value).toBe(true);
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

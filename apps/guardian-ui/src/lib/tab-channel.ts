/**
 * One tab tells the others
 *
 * Every open tab of this site shares one channel. A tab says when an alert
 * was saved, marked as seen or deleted, and when its watch starts and ends; a
 * tab that opens asks whether a watch runs, and a watching tab answers. So
 * the list of alerts, the count and the alert sound agree across tabs, and
 * the device holds one watch at a time. The channel is the browser's own and
 * reaches no service.
 *
 * @module lib/tab-channel
 */

import { useEffect, useState } from 'react';
import type { WayId } from './app-routes';

export type TabMessage =
  | { type: 'alerts-changed' }
  | { type: 'watch-started'; way: WayId }
  | { type: 'watch-ended' }
  | { type: 'watch-ask' }
  | { type: 'watch-answer'; way: WayId }
  | { type: 'watch-stop' };

const NAME = 'safeos';
const ANSWER_WAIT_MS = 300;
const STOP_WAIT_MS = 1000;

type Listener = (message: TabMessage) => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null | undefined;

function open(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(NAME) : null;
  } catch {
    channel = null;
  }
  if (channel) {
    channel.onmessage = (event: MessageEvent<TabMessage>) => listeners.forEach((listener) => listener(event.data));
  }
  return channel;
}

/** Hears what the other tabs say. */
export function onTabMessage(listener: Listener): () => void {
  open();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Says it to the other tabs of this device. */
export function tellTabs(message: TabMessage): void {
  try {
    open()?.postMessage(message);
  } catch {
    // A channel the browser closed says nothing.
  }
}

/** An alert was saved, marked as seen or deleted here: this tab's listeners and every other tab hear it. */
export function alertsChanged(): void {
  listeners.forEach((listener) => listener({ type: 'alerts-changed' }));
  tellTabs({ type: 'alerts-changed' });
}

/**
 * Whether another tab is watching or starting a watch. A tab that starts
 * while this one waits is watching too. A tab that hears neither in time is
 * told none is.
 */
export function askOtherTabs(): Promise<{ watching: boolean; way?: WayId }> {
  return new Promise((resolve) => {
    if (!open()) {
      resolve({ watching: false });
      return;
    }
    const done = (answer: { watching: boolean; way?: WayId }) => {
      clearTimeout(timer);
      off();
      resolve(answer);
    };
    const off = onTabMessage((message) => {
      if (message.type === 'watch-answer' || message.type === 'watch-started') done({ watching: true, way: message.way });
    });
    const timer = setTimeout(() => done({ watching: false }), ANSWER_WAIT_MS);
    tellTabs({ type: 'watch-ask' });
  });
}

// What this tab holds of the device's one watch: a start the dashboard has
// decided on (the claim) and the watch a way's page runs. While any is held
// the tab answers every ask, and a word to stop reaches each of them.
interface Hold {
  way: WayId;
  stop: () => void;
}
const holds = new Set<Hold>();
let claim: Hold | null = null;
let answering: (() => void) | null = null;

// A tab that is closed, reloaded or sent to another address runs no cleanup
// of its page, so what it holds ends here and the other tabs hear the watch
// ended.
function leave(): void {
  Array.from(holds).forEach((hold) => end(hold));
}

function begin(hold: Hold): void {
  const first = holds.size === 0;
  holds.add(hold);
  answering ??= onTabMessage((message) => {
    const latest = Array.from(holds).pop();
    if (message.type === 'watch-ask' && latest) tellTabs({ type: 'watch-answer', way: latest.way });
    if (message.type === 'watch-stop') Array.from(holds).forEach((held) => held.stop());
  });
  if (first) {
    if (typeof window !== 'undefined') window.addEventListener('pagehide', leave);
    tellTabs({ type: 'watch-started', way: hold.way });
  }
}

function end(hold: Hold): void {
  if (!holds.delete(hold)) return;
  if (claim === hold) claim = null;
  if (holds.size > 0) return;
  answering?.();
  answering = null;
  if (typeof window !== 'undefined') window.removeEventListener('pagehide', leave);
  tellTabs({ type: 'watch-ended' });
}

/**
 * A start this tab has decided on, held from before the camera is asked for.
 * The way's page takes it over when it announces its watch; the function
 * returned lets it go (the start failed, or no page took its camera). `stop`
 * runs when another tab takes over.
 */
export function claimWatch(way: WayId, stop: () => void): () => void {
  const before = claim;
  const hold = { way, stop };
  claim = hold;
  begin(hold);
  if (before) end(before);
  return () => end(hold);
}

/**
 * Called by the page whose watch runs, from the press that starts it, before
 * its camera is asked for. It tells the other tabs, answers a tab that asks,
 * ends its watch when another tab takes over, and takes over this tab's
 * claim with no word between. Returns the function to call when the watch ends.
 */
export function announceWatch(way: WayId, stop: () => void): () => void {
  const hold = { way, stop };
  begin(hold);
  if (claim) end(claim);
  return () => end(hold);
}

/**
 * Tells the watching tab to stop and waits until it says its watch ended:
 * true then. After a second with no word it asks once more: true when no tab
 * answers (the tab was closed), false while one goes on watching, and then
 * nothing may start.
 */
export function takeOverWatch(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!open()) {
      resolve(true);
      return;
    }
    const off = onTabMessage((message) => {
      if (message.type !== 'watch-ended') return;
      clearTimeout(timer);
      off();
      resolve(true);
    });
    const timer = setTimeout(() => {
      off();
      void askOtherTabs().then((answer) => resolve(!answer.watching));
    }, STOP_WAIT_MS);
    tellTabs({ type: 'watch-stop' });
  });
}

/**
 * Whether another tab of this device is watching, kept up to date. It asks
 * when it starts and again each time this tab comes back into view, so a
 * watching tab the system closed with no word reads as not watching.
 */
export function useOtherTabWatch(): boolean {
  const [watching, setWatching] = useState(false);
  useEffect(() => {
    let live = true;
    const off = onTabMessage((message) => {
      if (message.type === 'watch-started' || message.type === 'watch-answer') setWatching(true);
      if (message.type === 'watch-ended') setWatching(false);
    });
    const ask = () => {
      void askOtherTabs().then((answer) => {
        if (live) setWatching(answer.watching);
      });
    };
    const shown = () => {
      if (document.visibilityState === 'visible') ask();
    };
    ask();
    document.addEventListener('visibilitychange', shown);
    return () => {
      live = false;
      off();
      document.removeEventListener('visibilitychange', shown);
    };
  }, []);
  return watching;
}

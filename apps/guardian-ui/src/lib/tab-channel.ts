/**
 * One tab tells the others
 *
 * Every open tab of this site shares one channel. A tab says when an alert
 * was saved, marked as seen or deleted, and when its watch starts and ends; a
 * tab that opens asks whether a watch runs, and a watching tab answers. So
 * the list of alerts, the count and the alert sound agree across tabs, and
 * the device holds one watch at a time. The channel is the browser's own
 * BroadcastChannel, or local storage in a browser without one, and reaches
 * no service.
 *
 * @module lib/tab-channel
 */

import { useEffect, useState } from 'react';
import type { WayId } from './app-routes';

export type TabMessage =
  | { type: 'alerts-changed' }
  | { type: 'watch-started'; way: WayId }
  | { type: 'watch-ended' }
  | { type: 'watch-ask'; start?: Turn }
  | { type: 'watch-answer'; way?: WayId }
  | { type: 'watch-stop' };

/** A start's place in line: when its tab asked, and that tab's id, which breaks a tie. */
export interface Turn {
  at: number;
  tab: string;
}

const NAME = 'safeos';
const ANSWER_WAIT_MS = 300;
const STOP_WAIT_MS = 1000;
// A start that no watch took over by then is let go.
const RESERVE_MS = 10_000;
// A browser with no BroadcastChannel: the words go through local storage,
// which tells every other tab of a write, and the watching tab keeps a note
// of its watch there, which a tab that asks reads.
const MESSAGE_KEY = 'safeos-tab-message';
const WATCH_KEY = 'safeos-tab-watch';

/** This tab, among the others. */
const TAB = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

type Listener = (message: TabMessage) => void;
const listeners = new Set<Listener>();
type Transport = { kind: 'channel'; channel: BroadcastChannel } | { kind: 'storage' };
let transport: Transport | null | undefined;

function hear(message: TabMessage): void {
  respond(message);
  listeners.forEach((listener) => listener(message));
}

function storageWorks(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return false;
    window.localStorage.setItem(MESSAGE_KEY, '');
    window.localStorage.removeItem(MESSAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function open(): Transport | null {
  if (transport !== undefined) return transport;
  let channel: BroadcastChannel | null = null;
  try {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(NAME) : null;
  } catch {
    channel = null;
  }
  if (channel) {
    channel.onmessage = (event: MessageEvent<TabMessage>) => hear(event.data);
    transport = { kind: 'channel', channel };
  } else if (storageWorks()) {
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== MESSAGE_KEY || !event.newValue) return;
      try {
        const word = JSON.parse(event.newValue) as { from?: string; message?: TabMessage };
        if (word.from !== TAB && word.message) hear(word.message);
      } catch {
        // A word that does not read says nothing.
      }
    });
    transport = { kind: 'storage' };
  } else {
    transport = null;
  }
  return transport;
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
    const way = open();
    if (way?.kind === 'channel') way.channel.postMessage(message);
    if (way?.kind === 'storage') {
      window.localStorage.setItem(MESSAGE_KEY, JSON.stringify({ from: TAB, message, nonce: Math.random() }));
      window.localStorage.removeItem(MESSAGE_KEY);
    }
  } catch {
    // A channel the browser closed, or storage that refuses, says nothing.
  }
}

/** An alert was saved, marked as seen or deleted here: this tab's listeners and every other tab hear it. */
export function alertsChanged(): void {
  listeners.forEach((listener) => listener({ type: 'alerts-changed' }));
  tellTabs({ type: 'alerts-changed' });
}

// The note a watching or starting tab keeps in local storage when the words
// go through it: which tab, its way once its watch began, and when it last
// wrote the note.
interface WatchNote {
  tab: string;
  way?: WayId;
  at: number;
}

function readNote(): WatchNote | null {
  try {
    const note = JSON.parse(window.localStorage.getItem(WATCH_KEY) ?? 'null') as WatchNote | null;
    return note && typeof note.tab === 'string' ? note : null;
  } catch {
    return null;
  }
}

/** Another tab's note, if one is kept. */
function otherNote(): WatchNote | null {
  const note = readNote();
  return note && note.tab !== TAB ? note : null;
}

function writeNote(way?: WayId): void {
  if (open()?.kind !== 'storage') return;
  try {
    window.localStorage.setItem(WATCH_KEY, JSON.stringify({ tab: TAB, ...(way ? { way } : {}), at: Date.now() }));
  } catch {
    // Storage that refuses keeps no note.
  }
}

function dropNote(): void {
  if (open()?.kind !== 'storage' || readNote()?.tab !== TAB) return;
  try {
    window.localStorage.removeItem(WATCH_KEY);
  } catch {
    // Storage that refuses keeps the note it had.
  }
}

const first = (a: Turn, b: Turn) => a.at < b.at || (a.at === b.at && a.tab < b.tab);

/** Whether another tab watches, asked over the channel: true once one answers or starts, false after the wait. */
function askOverChannel(start?: Turn): Promise<{ watching: boolean; way?: WayId }> {
  return new Promise((resolve) => {
    const done = (answer: { watching: boolean; way?: WayId }) => {
      clearTimeout(timer);
      off();
      resolve(answer);
    };
    const off = onTabMessage((message) => {
      if (message.type === 'watch-answer' || message.type === 'watch-started') {
        done(message.way ? { watching: true, way: message.way } : { watching: true });
      }
      // Another tab's start that came first: that tab goes on, and this one
      // asks the person. The tab that came first may have heard this tab's
      // ask before it had a start of its own to answer with.
      if (start && message.type === 'watch-ask' && message.start && message.start.tab !== start.tab && first(message.start, start)) {
        done({ watching: true });
      }
    });
    const timer = setTimeout(() => done({ watching: false }), ANSWER_WAIT_MS);
    tellTabs(start ? { type: 'watch-ask', start } : { type: 'watch-ask' });
  });
}

/** Whether another tab watches or starts, asked to know only. */
function ask(): Promise<{ watching: boolean; way?: WayId }> {
  const way = open();
  if (way?.kind === 'channel') return askOverChannel();
  const note = otherNote();
  return Promise.resolve(note ? (note.way ? { watching: true, way: note.way } : { watching: true }) : { watching: false });
}

// This tab's start, from the press that asks until the way's watch begins
// here or the start ends. While it is held, the tab answers a tab that asks
// later, so of two tabs that press at once one starts and the other asks the
// person.
let turn: Turn | null = null;
let reserved: ReturnType<typeof setTimeout> | null = null;
let answeredTurn = false;

function endTurn(tell = false): void {
  if (reserved) clearTimeout(reserved);
  reserved = null;
  const told = tell || answeredTurn;
  turn = null;
  answeredTurn = false;
  if (holds.size > 0) return;
  dropNote();
  // A tab that heard of this start hears that it ended.
  if (told) tellTabs({ type: 'watch-ended' });
}

/**
 * Whether another tab is watching or starting a watch, asked by a start key.
 * A tab that starts while this one waits is watching too, and of two tabs
 * that ask at once the one that asked first is. A tab told none watches
 * holds the start from here, before its camera is asked for, until the way's
 * watch begins (`claimWatch`, `announceWatch`), `releaseStart()` or ten
 * seconds.
 */
export async function askOtherTabs(): Promise<{ watching: boolean; way?: WayId }> {
  const way = open();
  if (way?.kind === 'channel') {
    const mine: Turn = { at: Date.now(), tab: TAB };
    turn = mine;
    const answer = await askOverChannel(mine);
    if (turn !== mine) return answer;
    if (answer.watching) {
      turn = null;
      return answer;
    }
  } else {
    const note = otherNote();
    if (note) return note.way ? { watching: true, way: note.way } : { watching: true };
    turn = { at: Date.now(), tab: TAB };
    if (holds.size === 0) writeNote();
  }
  if (reserved) clearTimeout(reserved);
  reserved = setTimeout(() => endTurn(), RESERVE_MS);
  return { watching: false };
}

/** Lets go of this tab's start when no watch took it over: the start ended, failed or its page was left. */
export function releaseStart(): void {
  if (turn) endTurn();
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

function respond(message: TabMessage): void {
  if (message.type === 'watch-ask') {
    const latest = Array.from(holds).pop();
    if (latest) {
      tellTabs({ type: 'watch-answer', way: latest.way });
    } else if (turn && (!message.start || first(turn, message.start))) {
      answeredTurn = true;
      tellTabs({ type: 'watch-answer' });
    }
  }
  if (message.type === 'watch-stop') {
    Array.from(holds).forEach((held) => held.stop());
    // A start that no watch took over yet ends, and says so.
    if (holds.size === 0 && turn) endTurn(true);
    // A watch that goes on writes its note again, so the tab that asked
    // knows it is no closed tab's.
    const latest = Array.from(holds).pop();
    if (latest) writeNote(latest.way);
  }
}

// A tab that is closed, reloaded or sent to another address runs no cleanup
// of its page, so what it holds ends here and the other tabs hear the watch
// ended.
function leave(): void {
  Array.from(holds).forEach((hold) => end(hold));
  if (turn) endTurn();
}

function begin(hold: Hold): void {
  const firstHold = holds.size === 0;
  holds.add(hold);
  // The watch takes over this tab's start: it answers from here.
  if (reserved) clearTimeout(reserved);
  reserved = null;
  turn = null;
  answeredTurn = false;
  writeNote(hold.way);
  if (firstHold) {
    if (typeof window !== 'undefined') window.addEventListener('pagehide', leave);
    tellTabs({ type: 'watch-started', way: hold.way });
  }
}

function end(hold: Hold): void {
  if (!holds.delete(hold)) return;
  if (claim === hold) claim = null;
  if (holds.size > 0) return;
  if (typeof window !== 'undefined') window.removeEventListener('pagehide', leave);
  dropNote();
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
 * nothing may start. With the words in local storage, a note no tab wrote
 * again after the word to stop is a closed tab's, and is taken away.
 */
export function takeOverWatch(): Promise<boolean> {
  return new Promise((resolve) => {
    const way = open();
    if (!way) {
      resolve(true);
      return;
    }
    const note = way.kind === 'storage' ? otherNote() : null;
    if (way.kind === 'storage' && !note) {
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
      if (way.kind === 'channel') {
        void askOverChannel().then((answer) => resolve(!answer.watching));
        return;
      }
      const now = otherNote();
      if (now && note && now.tab === note.tab && now.at === note.at) {
        try {
          window.localStorage.removeItem(WATCH_KEY);
        } catch {
          // Storage that refuses keeps the note.
        }
        resolve(true);
        return;
      }
      resolve(!now);
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
    const check = () => {
      void ask().then((answer) => {
        if (live) setWatching(answer.watching);
      });
    };
    const shown = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    document.addEventListener('visibilitychange', shown);
    return () => {
      live = false;
      off();
      document.removeEventListener('visibilitychange', shown);
    };
  }, []);
  return watching;
}

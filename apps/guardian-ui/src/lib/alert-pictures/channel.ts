/**
 * News about alert pictures to this browser's other tabs: pictures that
 * went (deleted by the person, by their age or with their alert), a picture
 * that was saved, and a change of the settings. A tab that hears it shows
 * the same pictures and count with no reload.
 *
 * @module lib/alert-pictures/channel
 */

export type PictureNews =
  | { type: 'gone'; ids: string[]; reason: 'person' | 'age' | 'with-alert' }
  | { type: 'saved'; id: string }
  | { type: 'settings' };

const CHANNEL = 'safeos-alert-pictures';

let channel: BroadcastChannel | null | undefined;
const listeners = new Set<(news: PictureNews) => void>();

function open(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  // Only a browser's own channel: a test runner's would hold its process open.
  if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') {
    channel = null;
    return channel;
  }
  try {
    channel = new window.BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<PictureNews>) => {
      for (const listener of [...listeners]) listener(event.data);
    };
  } catch {
    channel = null;
  }
  return channel;
}

/** Tells the other tabs. This tab's own views are changed by the caller. */
export function postPictureNews(news: PictureNews): void {
  try {
    open()?.postMessage(news);
  } catch {
    // A closed channel tells nobody; each tab reads the store again when it next shows a picture.
  }
}

/** Hears the other tabs' news. Answers the way to stop. */
export function onPictureNews(listener: (news: PictureNews) => void): () => void {
  open();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

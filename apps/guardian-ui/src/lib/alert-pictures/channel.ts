/**
 * News about alert pictures to this browser's other tabs: pictures that
 * went (deleted by the person, by their age or with their alert), a picture
 * that was saved, and a change of the settings. A tab that hears it shows
 * the same pictures and count with no reload. The news goes on the tabs' one
 * channel (lib/tab-channel), as the alerts' own news does.
 *
 * @module lib/alert-pictures/channel
 */

import type { DeleteAfterDays } from '../../stores/alert-pictures-store';
import { onTabMessage, tellTabs } from '../tab-channel';

export type PictureNews =
  | { type: 'gone'; ids: string[]; reason: 'person' | 'age' | 'with-alert' }
  | { type: 'saved'; id: string }
  // The choices travel with the news: a tab can hear it before the browser hands it the saved choices.
  // `at` is when they were chosen. A tab of an earlier release sends none of them.
  | { type: 'settings'; keep?: boolean; deleteAfterDays?: DeleteAfterDays; at?: number };

/** The news of a change of the choices, as this tab's store holds them now. */
export function settingsNews(choices: { keep: boolean; deleteAfterDays: DeleteAfterDays; chosenAt: number }): PictureNews {
  return { type: 'settings', keep: choices.keep, deleteAfterDays: choices.deleteAfterDays, at: choices.chosenAt };
}

/** Tells the other tabs. This tab's own views are changed by the caller. */
export function postPictureNews(news: PictureNews): void {
  tellTabs({ type: 'pictures', news });
}

/** Hears the other tabs' news. Answers the way to stop. */
export function onPictureNews(listener: (news: PictureNews) => void): () => void {
  return onTabMessage((message) => {
    if (message.type === 'pictures') listener(message.news);
  });
}

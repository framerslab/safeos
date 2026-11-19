/**
 * Every word the alert pictures show, as constants and builders.
 *
 * A time is written the way the device writes times (hours, minutes and
 * seconds in its own format), so a card, its pictures' names and the
 * screen reader's line all say the same moment.
 *
 * @module lib/alert-pictures/words
 */

import type { AlertKind } from './rules';

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

const KIND_WORDS: Record<AlertKind, string> = {
  motion: 'Motion',
  sound: 'Sound',
  'picture-change': 'Picture change',
  sighting: 'Lost and Found',
};

const LEVEL_WORDS: Record<Severity, string> = {
  info: 'Info',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

/** "Motion", "Sound" or "Picture change". */
export const kindWords = (kind: AlertKind): string => KIND_WORDS[kind];

/** "Low", "Medium", "High" or "Critical". */
export const levelWords = (severity: Severity): string => LEVEL_WORDS[severity] ?? LEVEL_WORDS.low;

let clock: Intl.DateTimeFormat | null = null;

/** The time of day with its seconds, in the device's own format: "9:42:40 PM". */
export function timeWords(at: number | Date): string {
  clock ??= new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });
  return clock.format(at);
}

/** "Motion at 9:42:40 PM". */
export const kindAtTime = (kind: AlertKind, at: number | Date): string => `${kindWords(kind)} at ${timeWords(at)}`;

/** "in Doorway", where zones are set. */
export const inZone = (zone: string): string => `in ${zone}`;

/** The picture of the moment's text equivalent; a Sound alert's picture and a picture with no box carry no box sentence. */
export const pictureName = (boxed: boolean, at: number | Date): string =>
  boxed ? `What the camera saw at ${timeWords(at)}. A box marks what changed.` : `What the camera saw at ${timeWords(at)}.`;

/** The close-up's text equivalent. */
export const closeUpName = (at: number | Date): string => `Close-up of the boxed part at ${timeWords(at)}`;

export const CLOSE_UP = 'Close-up';
export const SOUND_LINE = 'What the camera saw when the sound came.';
export const PICTURE_CHANGE_LINE = 'Light or a shadow can set off a Picture change alert.';
export const DARK_LINE = 'This picture is too dark to show much. With a night light in the room, the camera shows more.';
export const NO_PICTURE = 'No picture was kept for this alert.';
export const DELETED_BY_PERSON = 'You deleted its picture.';
export const UNREADABLE = 'This picture could not be read on this device.';
export const SAVE_FAILED = 'This picture could not be saved on this device. It shows here until you reload.';

/** "Its picture was deleted after 3 days." */
export const deletedAfter = (days: number): string =>
  `Its picture was deleted after ${days === 1 ? '1 day' : `${days} days`}.`;

/** The polite status for a new alert: "New alert: Motion, Low, at 9:42:40 PM." */
export const announceAlert = (kind: AlertKind, severity: Severity, at: number | Date): string =>
  `New alert: ${kindWords(kind)}, ${levelWords(severity)}, at ${timeWords(at)}.`;

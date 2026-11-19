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

// =============================================================================
// Keep alert pictures: the group, the notice and the alert list's line
// =============================================================================

export const GROUP_NAME = 'Alert pictures';
export const KEEP_SWITCH = 'Keep alert pictures';
export const KEEP_OFF_LINE = 'Off. Each alert’s picture shows on the watch until you reload, and nothing is saved.';
export const DELETE_AFTER = 'Delete pictures after';
export const DELETE_AFTER_LINE = 'The alert’s words stay in History after its picture is deleted.';
export const UNTIL_I_DELETE = 'Until I delete them';

/** "1 day", "3 days", "7 days" or "30 days"; "Until I delete them" for no age. */
export const afterWords = (days: number | null): string =>
  days === null ? UNTIL_I_DELETE : days === 1 ? '1 day' : `${days} days`;

/** "3 pictures kept on this device", "1 picture kept on this device" or "No pictures kept on this device". */
export const keptWords = (count: number): string =>
  count === 0 ? 'No pictures kept on this device' : count === 1 ? '1 picture kept on this device' : `${count} pictures kept on this device`;

/** "The watch keeps its newest 100 alerts. A picture is deleted with its alert." */
export const limitLine = (limit: number): string =>
  `The watch keeps its newest ${limit} alerts. A picture is deleted with its alert.`;

export const DELETE_ALL = 'Delete all pictures';
export const KEEP_THEM = 'Keep them';
/** "Delete all 3 alert pictures from this device? The alerts’ words stay." */
export const deleteAllQuestion = (count: number): string =>
  `Delete all ${count} alert pictures from this device? The alerts’ words stay.`;
export const DELETE_FAILED = 'The pictures could not be deleted. Press Delete all pictures to try again.';

export const KEEPS_LINE = 'Each alert keeps the camera’s picture of the moment, a box round what changed and a close-up. A Sound alert keeps the picture alone.';
export const STAY_LINE = 'Alert pictures stay on this device. Anyone who can open SafeOS in this browser can see them.';
export const ASK_LINE = 'Ask before you watch or listen to another adult or the people you live with. Laws on recording sound differ by place.';
export const STREET_LINE = 'If the camera sees a street, a shared path or a neighbour’s home, the law where you live may treat its pictures as more than a private matter. Point it at your own property where you can, put up a sign, keep pictures only as long as you need them, and give someone their picture or delete it if they ask.';
export const ICO_LINK = 'Home CCTV guidance from the ICO, the UK’s regulator';
export const ICO_URL = 'https://ico.org.uk/for-the-public/home-cctv-systems/';
export const ICO_OFFLINE = 'Opens ico.org.uk';
export const PRIVATE_WINDOW_LINE = 'In a private window the browser usually deletes kept pictures when the window closes.';

export const NOTICE_TITLE = 'Each alert keeps a picture';
export const START_WATCHING = 'Start watching';
export const GO_BACK = 'Go back';

export const RAN_OUT_LINE = 'This device ran out of room for pictures. The oldest were deleted to keep the newest.';
export const OUT_OF_ROOM_LINE = 'This device is out of room, so new alert pictures are not kept. Free space on the device to keep them.';
export const WINDOW_LINE = 'This window keeps no pictures. To keep them, open SafeOS in a normal browser window.';
export const NOT_KEPT_LINE = 'This picture is not kept. It goes when you reload or close the page.';

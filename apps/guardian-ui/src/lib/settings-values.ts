/**
 * What each row of the settings list says
 *
 * Pure functions from the stores' values to the words a row shows: the
 * setting and its two values, the alert volume, quiet hours and the band they
 * draw across a day, and each other page's value line.
 *
 * @module lib/settings-values
 */

import { clockTime } from './clock-time';
import { settingName } from './setting-names';
import type { Ask } from './browser-asks';
import type { ThemeMode } from './theme-manager';
import type { DetectionZone, QuietHoursSettings } from '../stores/settings-store';

/** The alert line a meter draws for a sensitivity: the watch's own rule. */
export function alertLineOf(sensitivity: number): number {
  return Math.max(0, Math.min(100, 100 - sensitivity));
}

/** Minutes after midnight of a stored time "22:00". */
function minutesOf(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

/** A stored time "22:00" as this device writes a time of day ("10:00 PM"). */
export function clockTimeOf(hhmm: string): string {
  const at = new Date();
  const minutes = minutesOf(hhmm);
  at.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return clockTime(at.getTime());
}

// Monday first; 0 is Sunday as Date.getDay() counts.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

/** The days quiet hours or a set time apply on: "Every day", "Weekdays", "Mon, Wed, Fri". */
export function daysWords(days: number[], form: 'row' | 'line'): string {
  const set = new Set(days.filter((day) => day >= 0 && day <= 6));
  const has = (list: number[]) => list.length === set.size && list.every((day) => set.has(day));
  let words: string;
  if (set.size === 7) words = 'Every day';
  else if (has([1, 2, 3, 4, 5])) words = 'Weekdays';
  else if (has([0, 6])) words = 'Weekends';
  else if (set.size === 0) words = 'No days';
  else return WEEK.filter((day) => set.has(day)).map((day) => DAY_NAMES[day]).join(', ');
  return form === 'line' ? words.charAt(0).toLowerCase() + words.slice(1) : words;
}

/** Quiet hours' value: "Off", "Quiet now, until 7:00 AM" or "10:00 PM to 7:00 AM, every day". */
export function quietValue(
  q: Pick<QuietHoursSettings, 'enabled' | 'startTime' | 'endTime' | 'days'>,
  quietNow: boolean
): string {
  if (!q.enabled) return 'Off';
  if (quietNow) return `Quiet now, until ${clockTimeOf(q.endTime)}`;
  return `${clockTimeOf(q.startTime)} to ${clockTimeOf(q.endTime)}, ${daysWords(q.days, 'line')}`;
}

/** The quiet hours as fractions of a day, split at midnight. */
export function quietBand(startTime: string, endTime: string): Array<{ from: number; to: number }> {
  const day = 24 * 60;
  const start = minutesOf(startTime) / day;
  const end = minutesOf(endTime) / day;
  if (start === end) return [];
  if (start < end) return [{ from: start, to: end }];
  return [
    ...(end > 0 ? [{ from: 0, to: end }] : []),
    { from: start, to: 1 },
  ];
}

/** Detection's value: the setting, or the pet the next watch looks for, and its two values. */
export function detectionValue(v: {
  settingId: string;
  motion: number;
  sound: number;
  soundOn: boolean;
  pet: string | null;
}): string {
  const lead = v.pet ? `Lost and Found for ${v.pet}` : settingName(v.settingId);
  return `${lead}, motion ${v.motion}, ${v.soundOn ? `sound ${v.sound}` : 'sound off'}`;
}

/** Alert sounds' value: the volume, the sounds of one's own, or muted. */
export function soundsValue(v: { volume: number; own: number; muted: boolean }): string {
  if (v.muted) return `Muted, volume ${v.volume}`;
  return v.own > 0 ? `Volume ${v.volume}, ${v.own} of your own` : `Volume ${v.volume}`;
}

/** Unanswered alerts' value: the wait between alerts and when an alert gets louder. */
export function unansweredValue(waitSeconds: number, louderAfterSeconds: number): string {
  return `Wait ${waitSeconds} s, louder after ${louderAfterSeconds} s`;
}

/** Notifications' value from the browser's answer and the browser notifications choice. */
export function notificationsValue(ask: Ask, browserPush: boolean): string {
  if (ask === 'blocked') return 'Blocked in this browser';
  return ask === 'granted' && browserPush ? 'Browser notifications on' : 'Browser notifications off';
}

const coversWholePicture = (zone: DetectionZone) =>
  zone.x <= 0 && zone.y <= 0 && zone.width >= 100 && zone.height >= 100;

/** Detection zones' value: the whole picture, or how many zones are on. */
export function zonesValue(zones: DetectionZone[]): string {
  const on = zones.filter((zone) => zone.enabled && !coversWholePicture(zone)).length;
  if (on === 0) return 'Whole picture';
  return on === 1 ? '1 zone on' : `${on} zones on`;
}

/** Detection model's value; null while this device has not answered. */
export function modelValue(onDevice: boolean | null, sizeMb: string): string | null {
  if (onDevice === null) return null;
  return onDevice ? `On this device, ${sizeMb} MB` : 'For People and Wildlife: not on this device';
}

const LOOK_WORDS: Record<ThemeMode, string> = {
  light: 'Light look',
  dark: 'Dark look',
  system: 'Same as this device',
};

/** Look and text's value. */
export function lookValue(mode: ThemeMode, largeText: boolean): string {
  const look = LOOK_WORDS[mode] ?? LOOK_WORDS.system;
  return largeText ? `${look}, larger text` : look;
}

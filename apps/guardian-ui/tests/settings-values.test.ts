/** @jest-environment node */
/**
 * What each settings row says
 *
 * The list of settings pages shows each page's value in words. These are the
 * pure functions behind those words: the eight settings named for what they
 * do, the days and hours of quiet hours, the band they draw across a day, and
 * each row's value line.
 */

import { SETTING_ORDER, settingName } from '@/lib/setting-names';
import {
  alertLineOf,
  clockTimeOf,
  daysWords,
  detectionValue,
  lookValue,
  modelValue,
  notificationsValue,
  quietBand,
  quietValue,
  soundsValue,
  unansweredValue,
  zonesValue,
} from '@/lib/settings-values';
import { clockTime } from '@/lib/clock-time';
import { DEFAULT_DETECTION_ZONES } from '@/stores/settings-store';

it('names the eight settings for what they do', () => {
  expect(SETTING_ORDER.map(settingName)).toEqual([
    'Standard',
    'Night',
    'Silent',
    'Sleeping baby',
    'Sleeping pet',
    'Very sensitive',
    'Smallest movement',
    'Your own',
  ]);
  expect(settingName('gone')).toBe('Your own');
  expect(settingName(null)).toBe('Your own');
});

it('writes a stored time of day as this device writes a time', () => {
  const at = new Date();
  at.setHours(22, 0, 0, 0);
  expect(clockTimeOf('22:00')).toBe(clockTime(at.getTime()));
  at.setHours(7, 30, 0, 0);
  expect(clockTimeOf('07:30')).toBe(clockTime(at.getTime()));
});

it('says the days in a row and in a line', () => {
  expect(daysWords([0, 1, 2, 3, 4, 5, 6], 'row')).toBe('Every day');
  expect(daysWords([0, 1, 2, 3, 4, 5, 6], 'line')).toBe('every day');
  expect(daysWords([1, 2, 3, 4, 5], 'row')).toBe('Weekdays');
  expect(daysWords([6, 0], 'line')).toBe('weekends');
  expect(daysWords([5, 1, 3], 'row')).toBe('Mon, Wed, Fri');
  expect(daysWords([0, 6, 1], 'row')).toBe('Mon, Sat, Sun');
});

it('says quiet hours off, set, and quiet now', () => {
  const q = { enabled: true, startTime: '22:00', endTime: '07:00', days: [0, 1, 2, 3, 4, 5, 6] };
  expect(quietValue({ ...q, enabled: false }, false)).toBe('Off');
  expect(quietValue(q, true)).toBe(`Quiet now, until ${clockTimeOf('07:00')}`);
  expect(quietValue(q, false)).toBe(`${clockTimeOf('22:00')} to ${clockTimeOf('07:00')}, every day`);
  expect(quietValue({ ...q, days: [1, 2, 3, 4, 5] }, false)).toBe(`${clockTimeOf('22:00')} to ${clockTimeOf('07:00')}, weekdays`);
});

it('draws hours across midnight as two parts of the day', () => {
  expect(quietBand('22:00', '07:00')).toEqual([
    { from: 0, to: 7 / 24 },
    { from: 22 / 24, to: 1 },
  ]);
  expect(quietBand('13:00', '15:30')).toEqual([{ from: 13 / 24, to: 15.5 / 24 }]);
  expect(quietBand('09:00', '09:00')).toEqual([]);
});

it("says Detection's setting, the next watch's pet and its two values", () => {
  expect(detectionValue({ settingId: 'maximum', motion: 80, sound: 80, soundOn: true, pet: null })).toBe(
    'Standard, motion 80, sound 80'
  );
  expect(detectionValue({ settingId: 'maximum', motion: 80, sound: 80, soundOn: true, pet: 'Mittens' })).toBe(
    'Lost and Found for Mittens, motion 80, sound 80'
  );
  expect(detectionValue({ settingId: 'pet_sleep', motion: 90, sound: 70, soundOn: false, pet: null })).toBe(
    'Sleeping pet, motion 90, sound off'
  );
});

it('says the volume, sounds of your own and muted', () => {
  expect(soundsValue({ volume: 100, own: 0, muted: false })).toBe('Volume 100');
  expect(soundsValue({ volume: 80, own: 1, muted: false })).toBe('Volume 80, 1 of your own');
  expect(soundsValue({ volume: 80, own: 2, muted: true })).toBe('Muted, volume 80');
});

it('says the other rows', () => {
  expect(unansweredValue(30, 30)).toBe('Wait 30 s, louder after 30 s');
  expect(notificationsValue('blocked', true)).toBe('Blocked in this browser');
  expect(notificationsValue('granted', true)).toBe('Browser notifications on');
  expect(notificationsValue('granted', false)).toBe('Browser notifications off');
  expect(notificationsValue('not-asked', true)).toBe('Browser notifications off');
  expect(zonesValue(DEFAULT_DETECTION_ZONES)).toBe('Whole picture');
  expect(zonesValue(DEFAULT_DETECTION_ZONES.map((z) => ({ ...z, enabled: z.id === 'center' })))).toBe('1 zone on');
  expect(zonesValue(DEFAULT_DETECTION_ZONES.map((z) => ({ ...z, enabled: z.id !== 'full' })))).toBe('3 zones on');
  expect(zonesValue(DEFAULT_DETECTION_ZONES.map((z) => ({ ...z, enabled: true })))).toBe('3 zones on');
  expect(modelValue(null, '18.6')).toBeNull();
  expect(modelValue(false, '18.6')).toBe('For People and Wildlife: not on this device');
  expect(modelValue(true, '18.6')).toBe('On this device, 18.6 MB');
  expect(lookValue('light', false)).toBe('Light look');
  expect(lookValue('dark', true)).toBe('Dark look, larger text');
  expect(lookValue('system', false)).toBe('Same as this device');
  expect(alertLineOf(80)).toBe(20);
  expect(alertLineOf(130)).toBe(0);
  expect(alertLineOf(-5)).toBe(100);
});

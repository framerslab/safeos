/**
 * Set times: which setting a check puts on, and when.
 *
 * The rule is pure: the saved set times, whether set times are on, the set
 * time last put on, and the clock. A set time's setting goes on once each time
 * the set time begins (or when it is edited, or turned back on, while in
 * force); the person's own changes while it lasts stay.
 */
import { isScheduleActive, setTimeStep, type DayOfWeek, type Schedule } from '@/lib/schedule-manager';

const at = (day: number, hours: number, minutes = 0) => new Date(2026, 10, day, hours, minutes);
// 16 November 2026 is a Monday.
const MONDAY = 16;
const TUESDAY = 17;

const setTime = (preset: Schedule['preset'], days: DayOfWeek[], start = '22:00', end = '06:00'): Schedule => ({
  id: 'sched_night', name: 'Night', enabled: true, preset, days,
  timeSlot: { start, end }, priority: 10,
  createdAt: new Date(2026, 10, 1), updatedAt: new Date(2026, 10, 1),
});

describe('isScheduleActive', () => {
  it('keeps an overnight set time in force after midnight, on the day after the one it began', () => {
    const mondayNight = setTime('night', ['mon']);
    expect(isScheduleActive(mondayNight, at(MONDAY, 23))).toBe(true);
    expect(isScheduleActive(mondayNight, at(TUESDAY, 1))).toBe(true);
    // Monday 01:00 belongs to Sunday's night.
    expect(isScheduleActive(mondayNight, at(MONDAY, 1))).toBe(false);
    expect(isScheduleActive(mondayNight, at(TUESDAY, 23))).toBe(false);
  });
});

describe('setTimeStep', () => {
  const night = setTime('night', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

  it('puts the setting on once when the set time begins, and leaves the person\'s change after that', () => {
    const first = setTimeStep([night], true, null, at(MONDAY, 22));
    expect(first.preset).toBe('night');
    // Later the same night, or after a reload that kept the record.
    expect(setTimeStep([night], true, first.appliedKey, at(MONDAY, 23)).preset).toBeNull();
    expect(setTimeStep([night], true, first.appliedKey, at(TUESDAY, 1)).preset).toBeNull();
    // The next night is a new beginning.
    expect(setTimeStep([night], true, first.appliedKey, at(TUESDAY, 22)).preset).toBe('night');
  });

  it('puts the new setting on when a set time in force is edited', () => {
    const first = setTimeStep([night], true, null, at(MONDAY, 22));
    const edited = { ...night, preset: 'silent' as const };
    expect(setTimeStep([edited], true, first.appliedKey, at(MONDAY, 22, 5)).preset).toBe('silent');
  });

  it('puts the setting on again when the hours of the set time in force are edited', () => {
    const work = setTime('maximum', ['mon'], '09:00', '17:00');
    const applied = setTimeStep([work], true, null, at(MONDAY, 12));
    expect(applied.preset).toBe('maximum');
    // The person picks another setting; then the set time's hours are edited to 10:00 to 18:00.
    const edited = { ...work, timeSlot: { start: '10:00', end: '18:00' } };
    expect(setTimeStep([edited], true, applied.appliedKey, at(MONDAY, 12)).preset).toBe('maximum');
  });

  it('forgets the set time when set times are off, so turning them on again puts it back on', () => {
    const first = setTimeStep([night], true, null, at(MONDAY, 22));
    const off = setTimeStep([night], false, first.appliedKey, at(MONDAY, 22, 5));
    expect(off).toEqual({ preset: null, appliedKey: null });
    expect(setTimeStep([night], true, off.appliedKey, at(MONDAY, 22, 10)).preset).toBe('night');
  });

  it('forgets the set time when none is in force', () => {
    const first = setTimeStep([night], true, null, at(MONDAY, 22));
    expect(setTimeStep([night], true, first.appliedKey, at(TUESDAY, 12))).toEqual({ preset: null, appliedKey: null });
  });

  it('puts nothing on for a setting that does not exist', () => {
    const unknown = { ...night, preset: 'balanced' as Schedule['preset'] };
    expect(setTimeStep([unknown], true, null, at(MONDAY, 22)).preset).toBeNull();
  });
});

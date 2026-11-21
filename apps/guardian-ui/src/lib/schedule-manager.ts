/**
 * Schedule Manager
 *
 * Manages time-based monitoring profiles. Automatically switches
 * between presets based on configured schedules.
 *
 * Example use cases:
 * - "Night Mode" from 10pm-6am with higher sensitivity
 * - "Work Hours" from 9am-5pm with security focus
 * - "Nap Time" from 1pm-3pm with infant sleep preset
 *
 * @module lib/schedule-manager
 */

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_PRESETS, useSettingsStore, type PresetId } from '../stores/settings-store';
import { guardedStorage } from './storage-full';

// =============================================================================
// Types
// =============================================================================

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface TimeSlot {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

export interface Schedule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  preset: PresetId;
  days: DayOfWeek[];
  timeSlot: TimeSlot;
  priority: number; // Higher = takes precedence
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleState {
  schedules: Schedule[];
  activeScheduleId: string | null;
  schedulingEnabled: boolean;
  /**
   * The set time whose setting the check last put on: its id, its setting and
   * the day it began. Saved, so a reload inside the same set time leaves the
   * person's own changes.
   */
  appliedSetTime: string | null;

  // Actions
  addSchedule: (schedule: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateSchedule: (id: string, updates: Partial<Schedule>) => void;
  removeSchedule: (id: string) => void;
  toggleSchedule: (id: string) => void;
  setSchedulingEnabled: (enabled: boolean) => void;
  getActiveSchedule: () => Schedule | null;
  checkSchedules: () => Schedule | null;
}

// =============================================================================
// Constants
// =============================================================================

export const DAYS_OF_WEEK: { value: DayOfWeek; label: string; short: string }[] = [
  { value: 'mon', label: 'Monday', short: 'Mon' },
  { value: 'tue', label: 'Tuesday', short: 'Tue' },
  { value: 'wed', label: 'Wednesday', short: 'Wed' },
  { value: 'thu', label: 'Thursday', short: 'Thu' },
  { value: 'fri', label: 'Friday', short: 'Fri' },
  { value: 'sat', label: 'Saturday', short: 'Sat' },
  { value: 'sun', label: 'Sunday', short: 'Sun' },
];

export const DEFAULT_SCHEDULES: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Night Watch',
    description: 'Enhanced sensitivity during sleeping hours',
    enabled: false,
    preset: 'night',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    timeSlot: { start: '22:00', end: '06:00' },
    priority: 10,
  },
  {
    name: 'Work Hours',
    description: 'Security focus while away at work',
    enabled: false,
    preset: 'maximum',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    timeSlot: { start: '09:00', end: '17:00' },
    priority: 5,
  },
  {
    name: 'Nap Time',
    description: 'Baby monitoring during afternoon naps',
    enabled: false,
    preset: 'infant_sleep',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    timeSlot: { start: '13:00', end: '15:00' },
    priority: 15,
  },
];

// =============================================================================
// Utility Functions
// =============================================================================

function generateId(): string {
  return `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getCurrentDayOfWeek(at: Date = new Date()): DayOfWeek {
  const days: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[at.getDay()];
}

function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours, minutes };
}

function isTimeInRange(current: Date, start: string, end: string): boolean {
  const now = current.getHours() * 60 + current.getMinutes();
  const startTime = parseTime(start);
  const endTime = parseTime(end);
  const startMinutes = startTime.hours * 60 + startTime.minutes;
  const endMinutes = endTime.hours * 60 + endTime.minutes;

  // Handle overnight schedules (e.g., 22:00 - 06:00)
  if (endMinutes < startMinutes) {
    return now >= startMinutes || now < endMinutes;
  }

  return now >= startMinutes && now < endMinutes;
}

/**
 * The day the stretch of `schedule` in force at `now` began, or null when it is
 * not in force. An overnight set time (22:00 to 06:00) that begins on Monday
 * lasts into Tuesday morning: its days name the day it begins.
 */
function stretchStartDay(schedule: Schedule, now: Date): Date | null {
  if (!schedule.enabled) return null;
  if (!isTimeInRange(now, schedule.timeSlot.start, schedule.timeSlot.end)) return null;

  const start = parseTime(schedule.timeSlot.start);
  const startMinutes = start.hours * 60 + start.minutes;
  const minutes = now.getHours() * 60 + now.getMinutes();
  // Before the start time, the stretch in force is an overnight one that began the day before.
  const day = minutes >= startMinutes ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return schedule.days.includes(getCurrentDayOfWeek(day)) ? day : null;
}

export function isScheduleActive(schedule: Schedule, now: Date = new Date()): boolean {
  return stretchStartDay(schedule, now) !== null;
}

/** Whether `preset` names a setting the app has. */
export function isPresetId(preset: unknown): preset is PresetId {
  return typeof preset === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_PRESETS, preset);
}

/**
 * Whether a set time can put `preset` on: a named setting. Custom is not one,
 * as it holds whatever the watch runs at, and a set time has no values of its
 * own to restore.
 */
export function isSchedulablePreset(preset: unknown): preset is Exclude<PresetId, 'custom'> {
  return isPresetId(preset) && preset !== 'custom';
}

/** The settings the schedule form offers: the named ones. */
export const SCHEDULABLE_PRESETS = (Object.keys(DEFAULT_PRESETS) as PresetId[]).filter(isSchedulablePreset);

/**
 * The set time in force at `now` with the highest priority, or null. A set
 * time saved without a named setting (Custom, or one an earlier form saved)
 * never applies, and never outranks one that has a named setting.
 */
export function activeScheduleAt(schedules: Schedule[], now: Date): Schedule | null {
  return schedules
    .filter((s) => isSchedulablePreset(s.preset) && isScheduleActive(s, now))
    .sort((a, b) => b.priority - a.priority)[0] || null;
}

/**
 * The record of one occurrence of a set time: the set time, its setting, its
 * hours and the day it began. The hours are in the record too, so an edit to
 * them puts the setting on again.
 */
function occurrenceKey(schedule: Schedule, day: Date): string {
  return `${schedule.id}|${schedule.preset}|${schedule.timeSlot.start}-${schedule.timeSlot.end}|${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
}

/**
 * One check of the set times. A set time's setting goes on once each time the
 * set time begins, when the app opens inside one it has not put on, when the
 * set time in force is edited to another setting, and when set times are
 * turned back on inside one. Between those the person's own changes stay. A
 * set time without a named setting is never put on (activeScheduleAt).
 *
 * @returns the setting to put on (or null), and the record to keep of it
 */
export function setTimeStep(
  schedules: Schedule[],
  schedulingEnabled: boolean,
  appliedSetTime: string | null,
  now: Date,
): { preset: PresetId | null; appliedKey: string | null } {
  if (!schedulingEnabled) return { preset: null, appliedKey: null };
  const active = activeScheduleAt(schedules, now);
  const day = active && stretchStartDay(active, now);
  if (!active || !day) return { preset: null, appliedKey: null };

  const key = occurrenceKey(active, day);
  // The record holds, for each set time, the occurrence last put on, one a line. A set time
  // in force again after an overlapping one ends was put on already, and the person's change
  // stays; an edit of its hours or its setting, also back to a setting it had, is put on.
  const applied = appliedSetTime ? appliedSetTime.split('\n') : [];
  if (applied.includes(key)) return { preset: null, appliedKey: appliedSetTime };
  const kept = applied.filter((k) => !k.startsWith(`${active.id}|`) && schedules.some((s) => k.startsWith(`${s.id}|`)));
  return { preset: active.preset, appliedKey: [...kept, key].join('\n') };
}

export function getNextScheduleChange(schedules: Schedule[]): Date | null {
  const now = new Date();
  const currentDay = getCurrentDayOfWeek();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let nextChange: Date | null = null;

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;

    const startTime = parseTime(schedule.timeSlot.start);
    const endTime = parseTime(schedule.timeSlot.end);
    const startMinutes = startTime.hours * 60 + startTime.minutes;
    const endMinutes = endTime.hours * 60 + endTime.minutes;

    // Check if schedule is for today
    if (schedule.days.includes(currentDay)) {
      // Check start time
      if (startMinutes > currentMinutes) {
        const changeDate = new Date(now);
        changeDate.setHours(startTime.hours, startTime.minutes, 0, 0);
        if (!nextChange || changeDate < nextChange) {
          nextChange = changeDate;
        }
      }

      // Check end time (if not overnight)
      if (endMinutes > startMinutes && endMinutes > currentMinutes) {
        const changeDate = new Date(now);
        changeDate.setHours(endTime.hours, endTime.minutes, 0, 0);
        if (!nextChange || changeDate < nextChange) {
          nextChange = changeDate;
        }
      }
    }
  }

  return nextChange;
}

export function formatTimeSlot(slot: TimeSlot): string {
  const formatTime = (time: string) => {
    const { hours, minutes } = parseTime(time);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  return `${formatTime(slot.start)} - ${formatTime(slot.end)}`;
}

// =============================================================================
// Store
// =============================================================================

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      schedules: [],
      activeScheduleId: null,
      schedulingEnabled: true,
      appliedSetTime: null,

      addSchedule: (scheduleData) => {
        const id = generateId();
        const now = new Date();
        const schedule: Schedule = {
          ...scheduleData,
          id,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          schedules: [...state.schedules, schedule],
        }));

        return id;
      },

      updateSchedule: (id, updates) => {
        set((state) => ({
          schedules: state.schedules.map((s) =>
            s.id === id
              ? { ...s, ...updates, updatedAt: new Date() }
              : s
          ),
        }));
      },

      removeSchedule: (id) => {
        set((state) => ({
          schedules: state.schedules.filter((s) => s.id !== id),
          activeScheduleId: state.activeScheduleId === id ? null : state.activeScheduleId,
        }));
      },

      toggleSchedule: (id) => {
        set((state) => ({
          schedules: state.schedules.map((s) =>
            s.id === id
              ? { ...s, enabled: !s.enabled, updatedAt: new Date() }
              : s
          ),
        }));
      },

      setSchedulingEnabled: (enabled) => {
        // Turned off, the set time in force is forgotten, so turning set times
        // back on inside it puts its setting on again.
        set(enabled ? { schedulingEnabled: true } : { schedulingEnabled: false, appliedSetTime: null });
      },

      getActiveSchedule: () => {
        const { schedules, schedulingEnabled } = get();
        if (!schedulingEnabled) return null;

        return activeScheduleAt(schedules, new Date());
      },

      checkSchedules: () => {
        const activeSchedule = get().getActiveSchedule();

        set({ activeScheduleId: activeSchedule?.id || null });

        return activeSchedule;
      },
    }),
    {
      name: 'guardian-schedules',
      // Every page runs the set-time check, so a refused write must not throw.
      storage: createJSONStorage(() => guardedStorage),
      partialize: (state) => ({
        schedules: state.schedules,
        schedulingEnabled: state.schedulingEnabled,
        appliedSetTime: state.appliedSetTime,
      }),
    }
  )
);

/**
 * The setting a set time put on and the watch runs at now: the set time in
 * force, whose occurrence a check put on, while the active setting is
 * its setting. Null when the person changed the setting since, or none holds.
 */
export function setTimeSettingInForce(now: Date = new Date()): PresetId | null {
  const { schedules, schedulingEnabled, appliedSetTime } = useScheduleStore.getState();
  if (!schedulingEnabled || !appliedSetTime) return null;
  const active = activeScheduleAt(schedules, now);
  const day = active && stretchStartDay(active, now);
  if (!active || !day || !appliedSetTime.split('\n').includes(occurrenceKey(active, day))) return null;
  return useSettingsStore.getState().activePresetId === active.preset ? active.preset : null;
}

// =============================================================================
// Hook for schedule checking
// =============================================================================

import { useEffect } from 'react';

/**
 * Applies set times. Mounted once, in the app's providers, so a set time
 * applies on every page. It checks once a minute and whenever the set times or
 * their switch change; setTimeStep decides when a setting goes on.
 */
export function useScheduleChecker() {
  const activeScheduleId = useScheduleStore((state) => state.activeScheduleId);

  useEffect(() => {
    const runCheck = () => {
      const schedules = useScheduleStore.getState();
      // Keeps the set time in force marked on the Quiet Hours page.
      schedules.checkSchedules();
      const step = setTimeStep(schedules.schedules, schedules.schedulingEnabled, schedules.appliedSetTime, new Date());
      if (step.appliedKey !== schedules.appliedSetTime) useScheduleStore.setState({ appliedSetTime: step.appliedKey });
      if (step.preset) useSettingsStore.getState().setActivePreset(step.preset);
    };

    runCheck();
    const interval = setInterval(runCheck, 60_000);
    const unsubscribe = useScheduleStore.subscribe((state, previous) => {
      if (state.schedules !== previous.schedules || state.schedulingEnabled !== previous.schedulingEnabled) runCheck();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  return { activeScheduleId };
}

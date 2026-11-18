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
import type { PresetId } from '../stores/settings-store';

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

export function isScheduleActive(schedule: Schedule, now: Date = new Date()): boolean {
  if (!schedule.enabled) return false;

  const currentDay = getCurrentDayOfWeek(now);
  if (!schedule.days.includes(currentDay)) return false;

  return isTimeInRange(now, schedule.timeSlot.start, schedule.timeSlot.end);
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
        set({ schedulingEnabled: enabled });
      },

      getActiveSchedule: () => {
        const { schedules, schedulingEnabled } = get();
        if (!schedulingEnabled) return null;

        const activeSchedules = schedules
          .filter((s) => isScheduleActive(s))
          .sort((a, b) => b.priority - a.priority);

        return activeSchedules[0] || null;
      },

      checkSchedules: () => {
        const activeSchedule = get().getActiveSchedule();

        set({ activeScheduleId: activeSchedule?.id || null });

        return activeSchedule;
      },
    }),
    {
      name: 'guardian-schedules',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        schedules: state.schedules,
        schedulingEnabled: state.schedulingEnabled,
      }),
    }
  )
);

// =============================================================================
// Hook for schedule checking
// =============================================================================

import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settings-store';

/**
 * Applies set times. Mounted once, in the app's providers, so a set time
 * applies on every page. Once a minute it finds the set time in force; when
 * one begins, or the app opens inside one, its setting goes on. While it lasts
 * the person's own changes stay: the setting is not put back each minute.
 */
export function useScheduleChecker() {
  const activeScheduleId = useScheduleStore((state) => state.activeScheduleId);

  useEffect(() => {
    const runCheck = () => {
      const schedules = useScheduleStore.getState();
      if (!schedules.schedulingEnabled) return;
      const previous = schedules.activeScheduleId;
      const active = schedules.checkSchedules();
      if (active && active.id !== previous) {
        useSettingsStore.getState().setActivePreset(active.preset);
      }
    };

    runCheck();
    const interval = setInterval(runCheck, 60_000);
    return () => clearInterval(interval);
  }, []);

  return { activeScheduleId };
}

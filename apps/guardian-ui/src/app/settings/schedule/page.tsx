/**
 * Quiet Hours Settings Page
 *
 * Configure quiet hours scheduling, per-day settings, and notification modes.
 *
 * @module app/settings/schedule/page
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSettingsStore, type QuietHoursSettings, DEFAULT_PRESETS } from '../../../stores/settings-store';
import {
  useScheduleStore,
  DAYS_OF_WEEK as SCHEDULE_DAYS,
  formatTimeSlot,
  isScheduleActive,
  type Schedule,
  type DayOfWeek,
} from '../../../lib/schedule-manager';
import { BackButton } from '@/components/BackButton';

// =============================================================================
// Constants
// =============================================================================

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun', fullLabel: 'Sunday' },
  { value: 1, label: 'Mon', fullLabel: 'Monday' },
  { value: 2, label: 'Tue', fullLabel: 'Tuesday' },
  { value: 3, label: 'Wed', fullLabel: 'Wednesday' },
  { value: 4, label: 'Thu', fullLabel: 'Thursday' },
  { value: 5, label: 'Fri', fullLabel: 'Friday' },
  { value: 6, label: 'Sat', fullLabel: 'Saturday' },
];

const QUIET_MODES: Array<{
  value: 'silent' | 'reduced' | 'emergency_only';
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'silent',
    label: 'Silent',
    description: 'All alerts muted completely',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <line x1="22" y1="9" x2="16" y2="15" />
        <line x1="16" y1="9" x2="22" y2="15" />
      </svg>
    ),
  },
  {
    value: 'reduced',
    label: 'Reduced Volume',
    description: 'Alerts at lower volume',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    ),
  },
  {
    value: 'emergency_only',
    label: 'Emergency Only',
    description: 'Only critical alerts sound',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
];

// =============================================================================
// Quiet Hours Settings Page
// =============================================================================

export default function ScheduleSettingsPage() {
  const [mounted, setMounted] = useState(false);
  const { quietHoursSettings, updateQuietHoursSettings, isQuietHoursActive } = useSettingsStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const toggleDay = (day: number) => {
    const currentDays = quietHoursSettings.days;
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort();
    updateQuietHoursSettings({ days: newDays });
  };

  const isCurrentlyActive = isQuietHoursActive();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="p-4 sm:p-6 border-b border-slate-700/50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton
              fallbackHref="/settings"
              ariaLabel="Back to settings"
              className="bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white"
            />
            <div>
              <h1 className="text-xl font-bold text-white">Quiet Hours</h1>
              <p className="text-sm text-slate-400">
                Schedule when to mute or reduce alert sounds
              </p>
            </div>
          </div>

          {/* Status indicator */}
          <div
            className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 ${
              isCurrentlyActive
                ? 'bg-indigo-500/20 text-indigo-400'
                : quietHoursSettings.enabled
                  ? 'bg-slate-700/50 text-slate-400'
                  : 'bg-slate-700/30 text-slate-500'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isCurrentlyActive ? 'bg-indigo-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            {isCurrentlyActive ? 'Active Now' : quietHoursSettings.enabled ? 'Scheduled' : 'Off'}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Enable Toggle */}
        <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-white">Enable Quiet Hours</h3>
              <p className="text-sm text-slate-400 mt-1">
                Automatically reduce or mute alerts during specified times
              </p>
            </div>
            <button
              onClick={() => updateQuietHoursSettings({ enabled: !quietHoursSettings.enabled })}
              className={`relative w-14 h-7 rounded-full transition-colors min-w-[56px] ${
                quietHoursSettings.enabled ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
              role="switch"
              aria-checked={quietHoursSettings.enabled}
              aria-label="Enable quiet hours"
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  quietHoursSettings.enabled ? 'left-8' : 'left-1'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Time Settings */}
        <section
          className={`bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 transition-opacity ${
            !quietHoursSettings.enabled ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <h2 className="text-lg font-semibold text-white mb-4">Time Window</h2>

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="start-time" className="block text-sm font-medium text-slate-300 mb-2">
                Start Time
              </label>
              <input
                id="start-time"
                type="time"
                value={quietHoursSettings.startTime}
                onChange={(e) => updateQuietHoursSettings({ startTime: e.target.value })}
                className="w-full px-4 py-3 min-h-[44px] bg-slate-900 border border-slate-600 rounded-lg text-white text-lg font-mono
                           focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              <p className="text-xs text-slate-500 mt-1">When quiet hours begin</p>
            </div>

            <div>
              <label htmlFor="end-time" className="block text-sm font-medium text-slate-300 mb-2">
                End Time
              </label>
              <input
                id="end-time"
                type="time"
                value={quietHoursSettings.endTime}
                onChange={(e) => updateQuietHoursSettings({ endTime: e.target.value })}
                className="w-full px-4 py-3 min-h-[44px] bg-slate-900 border border-slate-600 rounded-lg text-white text-lg font-mono
                           focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              <p className="text-xs text-slate-500 mt-1">When normal alerts resume</p>
            </div>
          </div>

          {/* Overnight indicator */}
          {quietHoursSettings.startTime > quietHoursSettings.endTime && (
            <div className="mt-4 flex items-center gap-2 text-sm text-indigo-400">
              <MoonIcon />
              <span>Overnight schedule: {quietHoursSettings.startTime} to {quietHoursSettings.endTime} (next day)</span>
            </div>
          )}
        </section>

        {/* Days Selection */}
        <section
          className={`bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 transition-opacity ${
            !quietHoursSettings.enabled ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <h2 className="text-lg font-semibold text-white mb-4">Active Days</h2>
          <p className="text-sm text-slate-400 mb-4">Select which days quiet hours should be active</p>

          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day.value}
                onClick={() => toggleDay(day.value)}
                className={`px-4 py-2.5 min-w-[52px] min-h-[44px] rounded-lg font-medium text-sm transition-all ${
                  quietHoursSettings.days.includes(day.value)
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700'
                }`}
                aria-pressed={quietHoursSettings.days.includes(day.value)}
                aria-label={`${day.fullLabel} ${quietHoursSettings.days.includes(day.value) ? 'enabled' : 'disabled'}`}
              >
                {day.label}
              </button>
            ))}
          </div>

          {/* Quick select buttons */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => updateQuietHoursSettings({ days: [0, 1, 2, 3, 4, 5, 6] })}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Select All
            </button>
            <button
              onClick={() => updateQuietHoursSettings({ days: [1, 2, 3, 4, 5] })}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Weekdays
            </button>
            <button
              onClick={() => updateQuietHoursSettings({ days: [0, 6] })}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Weekends
            </button>
            <button
              onClick={() => updateQuietHoursSettings({ days: [] })}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>
        </section>

        {/* Mode Selection */}
        <section
          className={`bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 transition-opacity ${
            !quietHoursSettings.enabled ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <h2 className="text-lg font-semibold text-white mb-4">Quiet Mode</h2>
          <p className="text-sm text-slate-400 mb-4">How alerts should behave during quiet hours</p>

          <div className="grid gap-3">
            {QUIET_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => updateQuietHoursSettings({ mode: mode.value })}
                className={`flex items-center gap-4 p-4 rounded-lg border transition-all text-left min-h-[64px] ${
                  quietHoursSettings.mode === mode.value
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-slate-900/50 border-slate-700/50 hover:bg-slate-900'
                }`}
                aria-pressed={quietHoursSettings.mode === mode.value}
              >
                <span className="text-2xl" aria-hidden="true">{mode.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-white">{mode.label}</div>
                  <div className="text-sm text-slate-400">{mode.description}</div>
                </div>
                {quietHoursSettings.mode === mode.value && (
                  <CheckIcon className="w-5 h-5 text-emerald-400" />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Reduced Volume Slider (only for 'reduced' mode) */}
        {quietHoursSettings.mode === 'reduced' && quietHoursSettings.enabled && (
          <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Reduced Volume Level</h2>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Volume during quiet hours</span>
                <span className="text-emerald-400 font-medium">{quietHoursSettings.reducedVolume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={quietHoursSettings.reducedVolume}
                onChange={(e) => updateQuietHoursSettings({ reducedVolume: Number(e.target.value) })}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                           [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-emerald-500
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                aria-label="Reduced volume percentage"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Mute</span>
                <span>Full</span>
              </div>
            </div>
          </section>
        )}

        {/* Info Box */}
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
          <h3 className="text-sm font-medium text-blue-300 mb-2 flex items-center gap-2">
            <InfoIcon />
            Important
          </h3>
          <p className="text-sm text-slate-400">
            High and critical alerts bypass quiet hours on the server.
            Delivery still depends on channel settings and availability.
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700/50 pt-6">
          <h2 className="text-xl font-bold text-white mb-2">Scheduled Presets</h2>
          <p className="text-sm text-slate-400">
            Automatically switch monitoring presets based on time of day
          </p>
        </div>

        {/* Scheduled Presets Section */}
        <ScheduledPresetsSection />
      </div>
    </div>
  );
}

// =============================================================================
// Scheduled Presets Section
// =============================================================================

function ScheduledPresetsSection() {
  const {
    schedules,
    schedulingEnabled,
    activeScheduleId,
    addSchedule,
    updateSchedule,
    removeSchedule,
    toggleSchedule,
    setSchedulingEnabled,
  } = useScheduleStore();

  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  return (
    <div className="space-y-4">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div>
          <h3 className="font-medium text-white">Enable Scheduled Presets</h3>
          <p className="text-sm text-slate-400 mt-1">
            Automatically switch presets at scheduled times
          </p>
        </div>
        <button
          onClick={() => setSchedulingEnabled(!schedulingEnabled)}
          className={`relative w-14 h-7 rounded-full transition-colors min-w-[56px] ${
            schedulingEnabled ? 'bg-emerald-500' : 'bg-slate-600'
          }`}
          role="switch"
          aria-checked={schedulingEnabled}
        >
          <span
            className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
              schedulingEnabled ? 'left-8' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* Schedule List */}
      <div className={`space-y-3 ${!schedulingEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {schedules.length === 0 ? (
          <div className="text-center py-8 bg-slate-800/30 rounded-xl border border-slate-700/50">
            <ClockIcon className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400 mb-4">No scheduled presets yet</p>
            <button
              onClick={() => setShowNewForm(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
            >
              Create Schedule
            </button>
          </div>
        ) : (
          <>
            {schedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                isActive={schedule.id === activeScheduleId}
                onToggle={() => toggleSchedule(schedule.id)}
                onEdit={() => setIsEditing(schedule.id)}
                onDelete={() => removeSchedule(schedule.id)}
              />
            ))}
          </>
        )}

        {/* Add New Button */}
        {schedules.length > 0 && !showNewForm && (
          <button
            onClick={() => setShowNewForm(true)}
            className="w-full py-3 border-2 border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
          >
            + Add Schedule
          </button>
        )}
      </div>

      {/* New Schedule Form */}
      {showNewForm && (
        <ScheduleForm
          onSave={(data) => {
            addSchedule(data);
            setShowNewForm(false);
          }}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Edit Schedule Modal */}
      {isEditing && (
        <ScheduleEditModal
          schedule={schedules.find((s) => s.id === isEditing)!}
          onSave={(updates) => {
            updateSchedule(isEditing, updates);
            setIsEditing(null);
          }}
          onCancel={() => setIsEditing(null)}
        />
      )}
    </div>
  );
}

// =============================================================================
// Schedule Card
// =============================================================================

interface ScheduleCardProps {
  schedule: Schedule;
  isActive: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ScheduleCard({ schedule, isActive, onToggle, onEdit, onDelete }: ScheduleCardProps) {
  const preset = DEFAULT_PRESETS[schedule.preset];

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isActive
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : schedule.enabled
            ? 'bg-slate-800/50 border-slate-700/50'
            : 'bg-slate-800/30 border-slate-700/30 opacity-60'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Toggle */}
        <button
          onClick={onToggle}
          className={`mt-1 w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
            schedule.enabled ? 'bg-emerald-500' : 'bg-slate-600'
          }`}
        >
          <span
            className={`block w-4 h-4 rounded-full bg-white transition-transform ${
              schedule.enabled ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-white">{schedule.name}</h4>
            {isActive && (
              <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded-full">
                Active
              </span>
            )}
          </div>
          {schedule.description && (
            <p className="text-sm text-slate-400 mb-2">{schedule.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <ClockIcon className="w-3.5 h-3.5" />
              {formatTimeSlot(schedule.timeSlot)}
            </span>
            <span className="flex items-center gap-1">
              <CalendarIcon className="w-3.5 h-3.5" />
              {schedule.days.map((d) => SCHEDULE_DAYS.find((day) => day.value === d)?.short).join(', ')}
            </span>
            <span className="px-2 py-0.5 bg-slate-700 rounded text-slate-300">
              {preset?.name || schedule.preset}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            aria-label="Edit schedule"
          >
            <EditIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-400 transition-colors"
            aria-label="Delete schedule"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Schedule Form
// =============================================================================

interface ScheduleFormProps {
  initialData?: Partial<Schedule>;
  onSave: (data: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

function ScheduleForm({ initialData, onSave, onCancel }: ScheduleFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [preset, setPreset] = useState<string>(initialData?.preset || 'balanced');
  const [startTime, setStartTime] = useState(initialData?.timeSlot?.start || '09:00');
  const [endTime, setEndTime] = useState(initialData?.timeSlot?.end || '17:00');
  const [days, setDays] = useState<DayOfWeek[]>(initialData?.days || ['mon', 'tue', 'wed', 'thu', 'fri']);
  const [priority, setPriority] = useState(initialData?.priority || 5);

  const toggleDay = (day: DayOfWeek) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      description,
      enabled: true,
      preset: preset as any,
      days,
      timeSlot: { start: startTime, end: endTime },
      priority,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-4">
      <h3 className="text-lg font-semibold text-white">
        {initialData ? 'Edit Schedule' : 'New Schedule'}
      </h3>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Night Watch"
          className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white
                     focus:outline-none focus:border-emerald-500"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., Enhanced sensitivity at night"
          className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white
                     focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Preset */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Preset</label>
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white
                     focus:outline-none focus:border-emerald-500"
        >
          {Object.entries(DEFAULT_PRESETS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white
                       focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">End Time</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white
                       focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Days */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Days</label>
        <div className="flex flex-wrap gap-2">
          {SCHEDULE_DAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleDay(day.value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                days.includes(day.value)
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-700/50 text-slate-400 border border-slate-600/50'
              }`}
            >
              {day.short}
            </button>
          ))}
        </div>
      </div>

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Priority: {priority}
        </label>
        <input
          type="range"
          min={1}
          max={20}
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-500
                     [&::-webkit-slider-thumb]:rounded-full"
        />
        <p className="text-xs text-slate-500 mt-1">Higher priority schedules take precedence</p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
        >
          Save Schedule
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// Schedule Edit Modal
// =============================================================================

interface ScheduleEditModalProps {
  schedule: Schedule;
  onSave: (updates: Partial<Schedule>) => void;
  onCancel: () => void;
}

function ScheduleEditModal({ schedule, onSave, onCancel }: ScheduleEditModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg">
        <ScheduleForm
          initialData={schedule}
          onSave={(data) => onSave(data)}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ClockIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CalendarIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function EditIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function TrashIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

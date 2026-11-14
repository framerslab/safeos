/**
 * Inline Settings Panel
 *
 * Comprehensive settings panel for the monitor page with expandable sections.
 * All settings are available inline without navigating away.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  useSettingsStore,
  DEFAULT_PRESETS,
  isSleepPreset,
  type PresetId,
  type AlertSeverity,
} from '../../stores/settings-store';
import { ExpandableSection, ToggleSwitch, SettingsSlider } from './ExpandableSection';
import { InfoTooltip } from './Tooltip';

interface InlineSettingsPanelProps {
  defaultExpanded?: string[];
}

const PRESET_BUTTONS: { id: PresetId; label: string; icon: React.ReactNode; color: string }[] = [
  {
    id: 'infant_sleep',
    label: 'Infant',
    icon: (
      <svg className="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M20 21a8 8 0 1 0-16 0" />
      </svg>
    ),
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  },
  {
    id: 'pet_sleep',
    label: 'Pet',
    icon: (
      <svg className="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="4" r="2" />
        <circle cx="18" cy="8" r="2" />
        <circle cx="20" cy="16" r="2" />
        <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
      </svg>
    ),
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  },
  {
    id: 'silent',
    label: 'Silent',
    icon: (
      <svg className="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    ),
    color: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
  },
  {
    id: 'night',
    label: 'Night',
    icon: (
      <svg className="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
    color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50',
  },
  {
    id: 'maximum',
    label: 'Max',
    icon: (
      <svg className="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
  },
  {
    id: 'ultimate',
    label: 'Ultimate',
    icon: (
      <svg className="w-4 h-4 inline-block" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="12" r="6" />
      </svg>
    ),
    color: 'bg-red-500/20 text-red-400 border-red-500/50',
  },
];

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const SEVERITY_OPTIONS: { value: AlertSeverity; label: string; color: string }[] = [
  { value: 'info', label: 'Info', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'low', label: 'Low', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'medium', label: 'Med', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'high', label: 'High', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'critical', label: 'Crit', color: 'bg-red-500/20 text-red-400' },
];

export function InlineSettingsPanel({ defaultExpanded = ['detection'] }: InlineSettingsPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(defaultExpanded));

  const {
    activePresetId,
    setActivePreset,
    globalSettings,
    updateGlobalSettings,
    audioSettings,
    updateAudioSettings,
    quietHoursSettings,
    updateQuietHoursSettings,
    timingSettings,
    updateTimingSettings,
    severityCooldowns,
    updateSeverityCooldowns,
    detectionFeatureSettings,
    updateDetectionFeatureSettings,
    globalMute,
    toggleGlobalMute,
  } = useSettingsStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-slate-800/50 rounded-xl" />
        ))}
      </div>
    );
  }

  const toggleSection = (id: string, expanded: boolean) => {
    const newSet = new Set(expandedSections);
    if (expanded) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setExpandedSections(newSet);
  };

  const currentPreset = DEFAULT_PRESETS[activePresetId] || DEFAULT_PRESETS.maximum;

  return (
    <div className="space-y-3 mt-6">
      {/* Mode Selection - Always Visible */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">Mode Selection</h3>
          <InfoTooltip content="Choose a preset mode that matches your monitoring scenario. Each mode has optimized settings for different use cases." />
        </div>

        {/* Preset Pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESET_BUTTONS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setActivePreset(preset.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all min-h-[44px] ${
                activePresetId === preset.id
                  ? preset.color
                  : 'bg-slate-700/50 text-slate-400 border-slate-600/50 hover:bg-slate-700'
              }`}
            >
              <span className="mr-1">{preset.icon}</span>
              {preset.label}
            </button>
          ))}
        </div>

        {/* Current Mode Info */}
        <div className="p-3 bg-slate-900/50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-white">{currentPreset.name}</span>
            {isSleepPreset(activePresetId) && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">Sleep Mode</span>
            )}
            {currentPreset.emergencyMode && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Emergency</span>
            )}
          </div>
          <p className="text-xs text-slate-400">{currentPreset.description}</p>
        </div>
      </div>

      {/* Detection Types */}
      <ExpandableSection
        id="detection"
        title="Detection Types"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        }
        summary={
          <span className="flex items-center gap-2 flex-wrap">
            <span className={globalSettings.motionDetectionEnabled ? 'text-emerald-400' : 'text-slate-500'}>Motion {globalSettings.motionDetectionEnabled ? 'ON' : 'OFF'}</span>
            <span className="text-slate-600">|</span>
            <span className={globalSettings.pixelDetectionEnabled ? 'text-emerald-400' : 'text-slate-500'}>Pixel {globalSettings.pixelDetectionEnabled ? 'ON' : 'OFF'}</span>
            <span className="text-slate-600">|</span>
            <span className={globalSettings.audioDetectionEnabled ? 'text-emerald-400' : 'text-slate-500'}>Audio {globalSettings.audioDetectionEnabled ? 'ON' : 'OFF'}</span>
          </span>
        }
        defaultExpanded={expandedSections.has('detection')}
        onToggle={(expanded) => toggleSection('detection', expanded)}
      >
        <div className="space-y-3">
          {/* Motion Detection */}
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center">
                <span className="text-sm text-white">Motion Detection</span>
                <InfoTooltip content="Detects movement by comparing consecutive video frames. Good for general activity monitoring." />
              </div>
              <span className="text-xs text-slate-500">Frame-based movement analysis</span>
            </div>
            <ToggleSwitch
              enabled={globalSettings.motionDetectionEnabled}
              onChange={(enabled) => updateGlobalSettings({ motionDetectionEnabled: enabled })}
              aria-label="Toggle motion detection"
            />
          </div>

          {/* Pixel Detection */}
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center">
                <span className="text-sm text-white">Pixel Detection</span>
                <InfoTooltip content="Ultra-precise detection that counts exact pixels changed. Best for sleep monitoring where tiny movements matter." />
              </div>
              <span className="text-xs text-slate-500">Ultra-sensitive sleep monitoring</span>
            </div>
            <ToggleSwitch
              enabled={globalSettings.pixelDetectionEnabled}
              onChange={(enabled) => updateGlobalSettings({ pixelDetectionEnabled: enabled })}
              aria-label="Toggle pixel detection"
            />
          </div>

          {/* Audio Detection */}
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center">
                <span className="text-sm text-white">Audio Detection</span>
                <InfoTooltip content="Monitors sound levels and patterns. Useful for detecting cries, barking, or distress sounds." />
              </div>
              <span className="text-xs text-slate-500">Sound level monitoring</span>
            </div>
            <ToggleSwitch
              enabled={globalSettings.audioDetectionEnabled}
              onChange={(enabled) => updateGlobalSettings({ audioDetectionEnabled: enabled })}
              aria-label="Toggle audio detection"
            />
          </div>

          {/* Person Detection (AI) */}
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center">
                <span className="text-sm text-white">Person Detection</span>
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">AI</span>
                <InfoTooltip content="Uses TensorFlow.js COCO-SSD model to detect human shapes. Requires an 18.6 MB model download on first use." />
              </div>
              <span className="text-xs text-slate-500">AI-powered human detection</span>
            </div>
            <ToggleSwitch
              enabled={detectionFeatureSettings.personDetectionEnabled}
              onChange={(enabled) => updateDetectionFeatureSettings({ personDetectionEnabled: enabled })}
              aria-label="Toggle person detection"
            />
          </div>

          {/* Animal Detection (AI) */}
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center">
                <span className="text-sm text-white">Animal Detection</span>
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">AI</span>
                <InfoTooltip content="Detects dogs, cats, and wildlife using AI. Can classify animal size and potential danger level." />
              </div>
              <span className="text-xs text-slate-500">Dogs, cats, wildlife</span>
            </div>
            <ToggleSwitch
              enabled={detectionFeatureSettings.animalDetectionEnabled}
              onChange={(enabled) => updateDetectionFeatureSettings({ animalDetectionEnabled: enabled })}
              aria-label="Toggle animal detection"
            />
          </div>
        </div>
      </ExpandableSection>

      {/* Sensitivity Controls */}
      <ExpandableSection
        id="sensitivity"
        title="Sensitivity"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        }
        summary={
          <span>
            Motion: {globalSettings.motionSensitivity}% | Audio: {globalSettings.audioSensitivity}% | Pixel: {globalSettings.absolutePixelThreshold}px
          </span>
        }
        defaultExpanded={expandedSections.has('sensitivity')}
        onToggle={(expanded) => toggleSection('sensitivity', expanded)}
      >
        <SettingsSlider
          label="Motion Sensitivity"
          value={globalSettings.motionSensitivity}
          onChange={(v) => updateGlobalSettings({ motionSensitivity: v })}
          min={0}
          max={100}
          unit="%"
          color="blue"
        />
        <SettingsSlider
          label="Audio Sensitivity"
          value={globalSettings.audioSensitivity}
          onChange={(v) => updateGlobalSettings({ audioSensitivity: v })}
          min={0}
          max={100}
          unit="%"
          color="purple"
        />
        <SettingsSlider
          label="Pixel Threshold"
          value={globalSettings.absolutePixelThreshold}
          onChange={(v) => updateGlobalSettings({ absolutePixelThreshold: v })}
          min={1}
          max={100}
          unit="px"
          color="emerald"
        />
        <div className="text-[10px] text-slate-500 -mt-2">
          Lower = more sensitive (fewer pixels needed to trigger)
        </div>
        <SettingsSlider
          label="Analysis Interval"
          value={globalSettings.analysisInterval}
          onChange={(v) => updateGlobalSettings({ analysisInterval: v })}
          min={1}
          max={60}
          unit="s"
          color="amber"
        />
      </ExpandableSection>

      {/* Audio Settings */}
      <ExpandableSection
        id="audio"
        title="Audio Settings"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        }
        summary={
          <span>
            {audioSettings.frequencyRange === 'all' ? 'All Frequencies' :
             audioSettings.frequencyRange === 'baby_cry' ? 'Baby Cry' :
             audioSettings.frequencyRange === 'pet_sounds' ? 'Pet Sounds' :
             audioSettings.frequencyRange === 'elderly_fall' ? 'Elderly Fall' : 'Custom'} |
            Noise Filter: {audioSettings.backgroundNoiseFilter ? 'ON' : 'OFF'}
          </span>
        }
        defaultExpanded={expandedSections.has('audio')}
        onToggle={(expanded) => toggleSection('audio', expanded)}
      >
        <div className="space-y-2">
          {[
            { value: 'all', label: 'All Frequencies', desc: 'Monitor all audio' },
            { value: 'baby_cry', label: 'Baby Cry Detection', desc: '300-600Hz focus' },
            { value: 'pet_sounds', label: 'Pet Sounds', desc: 'Barks, whines' },
            { value: 'elderly_fall', label: 'Elderly Fall', desc: 'Impact sounds' },
            { value: 'custom', label: 'Custom Range', desc: 'Define your own' },
          ].map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                audioSettings.frequencyRange === opt.value
                  ? 'bg-emerald-500/10 border border-emerald-500/50'
                  : 'bg-slate-900/50 border border-transparent hover:bg-slate-900/70'
              }`}
            >
              <input
                type="radio"
                name="frequencyRange"
                value={opt.value}
                checked={audioSettings.frequencyRange === opt.value}
                onChange={() => updateAudioSettings({ frequencyRange: opt.value as typeof audioSettings.frequencyRange })}
                className="w-4 h-4 text-emerald-500"
              />
              <div>
                <div className="text-sm text-white">{opt.label}</div>
                <div className="text-xs text-slate-500">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {audioSettings.frequencyRange === 'custom' && (
          <div className="mt-4 p-3 bg-slate-900/50 rounded-lg space-y-4">
            <SettingsSlider
              label="Low Frequency"
              value={audioSettings.customLowFreq}
              onChange={(v) => updateAudioSettings({ customLowFreq: v })}
              min={20}
              max={2000}
              step={10}
              unit=" Hz"
              color="blue"
            />
            <SettingsSlider
              label="High Frequency"
              value={audioSettings.customHighFreq}
              onChange={(v) => updateAudioSettings({ customHighFreq: v })}
              min={2000}
              max={20000}
              step={100}
              unit=" Hz"
              color="purple"
            />
          </div>
        )}

        <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg mt-4">
          <div>
            <div className="flex items-center">
              <span className="text-sm text-white">Background Noise Filter</span>
              <InfoTooltip content="Reduces false positives from ambient noise like fans, traffic, or appliances." />
            </div>
            <span className="text-xs text-slate-500">Reduce false positives</span>
          </div>
          <ToggleSwitch
            enabled={audioSettings.backgroundNoiseFilter}
            onChange={(enabled) => updateAudioSettings({ backgroundNoiseFilter: enabled })}
            aria-label="Toggle background noise filter"
          />
        </div>
      </ExpandableSection>

      {/* Quiet Hours */}
      <ExpandableSection
        id="quiet"
        title="Quiet Hours"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        }
        summary={
          <span>
            {quietHoursSettings.enabled ? `${quietHoursSettings.startTime} - ${quietHoursSettings.endTime}` : 'Disabled'} |
            Mode: {quietHoursSettings.mode}
          </span>
        }
        defaultExpanded={expandedSections.has('quiet')}
        onToggle={(expanded) => toggleSection('quiet', expanded)}
      >
        <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
          <div>
            <span className="text-sm text-white">Enable Quiet Hours</span>
            <div className="text-xs text-slate-500">Reduce or mute alerts during set times</div>
          </div>
          <ToggleSwitch
            enabled={quietHoursSettings.enabled}
            onChange={(enabled) => updateQuietHoursSettings({ enabled })}
            aria-label="Toggle quiet hours"
          />
        </div>

        {quietHoursSettings.enabled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Start Time</label>
                <input
                  type="time"
                  value={quietHoursSettings.startTime}
                  onChange={(e) => updateQuietHoursSettings({ startTime: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">End Time</label>
                <input
                  type="time"
                  value={quietHoursSettings.endTime}
                  onChange={(e) => updateQuietHoursSettings({ endTime: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-2">Active Days</label>
              <div className="flex gap-1">
                {DAYS.map((day, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const newDays = quietHoursSettings.days.includes(i)
                        ? quietHoursSettings.days.filter((d) => d !== i)
                        : [...quietHoursSettings.days, i];
                      updateQuietHoursSettings({ days: newDays });
                    }}
                    className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors ${
                      quietHoursSettings.days.includes(i)
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                        : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 block">Mode</label>
              {[
                { value: 'silent', label: 'Silent', desc: 'No sound at all' },
                { value: 'reduced', label: 'Reduced', desc: 'Lower volume alerts' },
                { value: 'emergency_only', label: 'Emergency Only', desc: 'Only critical alerts' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    quietHoursSettings.mode === opt.value
                      ? 'bg-emerald-500/10 border border-emerald-500/50'
                      : 'bg-slate-900/50 border border-transparent hover:bg-slate-900/70'
                  }`}
                >
                  <input
                    type="radio"
                    name="quietMode"
                    value={opt.value}
                    checked={quietHoursSettings.mode === opt.value}
                    onChange={() => updateQuietHoursSettings({ mode: opt.value as typeof quietHoursSettings.mode })}
                    className="w-4 h-4 text-emerald-500"
                  />
                  <div>
                    <div className="text-sm text-white">{opt.label}</div>
                    <div className="text-xs text-slate-500">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {quietHoursSettings.mode === 'reduced' && (
              <SettingsSlider
                label="Reduced Volume"
                value={quietHoursSettings.reducedVolume}
                onChange={(v) => updateQuietHoursSettings({ reducedVolume: v })}
                min={0}
                max={100}
                unit="%"
                color="amber"
              />
            )}
          </>
        )}
      </ExpandableSection>

      {/* Timing & Alerts */}
      <ExpandableSection
        id="timing"
        title="Timing & Alerts"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        summary={
          <span>
            Cooldown: {timingSettings.cooldownPeriod}s | Escalation: {Math.round(timingSettings.emergencyEscalationDelay / 60)}min
          </span>
        }
        defaultExpanded={expandedSections.has('timing')}
        onToggle={(expanded) => toggleSection('timing', expanded)}
      >
        <SettingsSlider
          label="Alert Cooldown"
          value={timingSettings.cooldownPeriod}
          onChange={(v) => updateTimingSettings({ cooldownPeriod: v })}
          min={10}
          max={300}
          unit="s"
          color="blue"
        />
        <div className="text-[10px] text-slate-500 -mt-2">
          Minimum time between alerts of the same type
        </div>

        <SettingsSlider
          label="Emergency Escalation"
          value={timingSettings.emergencyEscalationDelay}
          onChange={(v) => updateTimingSettings({ emergencyEscalationDelay: v })}
          min={60}
          max={600}
          step={30}
          unit="s"
          color="red"
        />
        <div className="text-[10px] text-slate-500 -mt-2">
          Time before auto-escalating to emergency level
        </div>

        <div className="p-3 bg-slate-900/50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-white">Per-Severity Cooldowns</span>
            <InfoTooltip content="Different cooldown periods for each alert severity. Critical alerts have no cooldown by default." />
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            {SEVERITY_OPTIONS.map((sev) => (
              <div key={sev.value}>
                <div className={`text-xs font-medium mb-1 ${sev.color.split(' ')[1]}`}>{sev.label}</div>
                <input
                  type="number"
                  value={severityCooldowns[sev.value]}
                  onChange={(e) => updateSeverityCooldowns({ [sev.value]: Number(e.target.value) })}
                  className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-center text-xs text-white"
                  min={0}
                  max={300}
                />
                <div className="text-[10px] text-slate-500 mt-0.5">sec</div>
              </div>
            ))}
          </div>
        </div>
      </ExpandableSection>

      {/* Inactivity Monitoring */}
      <ExpandableSection
        id="inactivity"
        title="Inactivity Monitoring"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        summary={
          <span>
            {detectionFeatureSettings.inactivityMonitoringEnabled
              ? `Alert after ${detectionFeatureSettings.inactivityAlertMinutes} min of no movement`
              : 'Disabled'}
          </span>
        }
        defaultExpanded={expandedSections.has('inactivity')}
        onToggle={(expanded) => toggleSection('inactivity', expanded)}
      >
        <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
          <div>
            <div className="flex items-center">
              <span className="text-sm text-white">Enable Inactivity Alerts</span>
              <InfoTooltip content="Get notified when no movement is detected for a specified duration. Useful for elderly monitoring." />
            </div>
            <span className="text-xs text-slate-500">Alert when no movement detected</span>
          </div>
          <ToggleSwitch
            enabled={detectionFeatureSettings.inactivityMonitoringEnabled}
            onChange={(enabled) => updateDetectionFeatureSettings({ inactivityMonitoringEnabled: enabled })}
            aria-label="Toggle inactivity monitoring"
          />
        </div>

        {detectionFeatureSettings.inactivityMonitoringEnabled && (
          <>
            <SettingsSlider
              label="Alert After"
              value={detectionFeatureSettings.inactivityAlertMinutes}
              onChange={(v) => updateDetectionFeatureSettings({ inactivityAlertMinutes: v })}
              min={1}
              max={60}
              unit=" min"
              color="amber"
            />

            <div>
              <label className="text-xs text-slate-400 block mb-2">Alert Severity</label>
              <div className="flex flex-wrap gap-2">
                {SEVERITY_OPTIONS.map((sev) => (
                  <button
                    key={sev.value}
                    onClick={() => updateDetectionFeatureSettings({ inactivitySeverity: sev.value })}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
                      detectionFeatureSettings.inactivitySeverity === sev.value
                        ? sev.color + ' border border-current'
                        : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                    }`}
                  >
                    {sev.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </ExpandableSection>

      {/* Quick Controls Bar */}
      <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleGlobalMute}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              globalMute
                ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                : 'bg-slate-700/50 text-slate-400 border border-slate-600 hover:bg-slate-700'
            }`}
          >
            {globalMute ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
            {globalMute ? 'Unmute' : 'Mute'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Volume:</span>
          <input
            type="range"
            min={0}
            max={100}
            value={globalSettings.alertVolume}
            onChange={(e) => updateGlobalSettings({ alertVolume: Number(e.target.value) })}
            className="w-24 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-500
                       [&::-webkit-slider-thumb]:rounded-full"
            aria-label="Alert volume"
          />
          <span className="text-xs text-emerald-400 w-8">{globalSettings.alertVolume}%</span>
        </div>
      </div>
    </div>
  );
}

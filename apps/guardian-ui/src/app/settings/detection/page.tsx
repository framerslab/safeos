/**
 * Detection Features Settings Page
 *
 * Configure detection types, audio frequency filtering, AI detection,
 * per-scenario overrides, and inactivity monitoring.
 *
 * @module app/settings/detection/page
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  useSettingsStore,
  type AlertSeverity,
  type ScenarioType,
} from '../../../stores/settings-store';
import { BackButton } from '@/components/BackButton';

// =============================================================================
// Types
// =============================================================================

interface ScenarioConfig {
  id: ScenarioType;
  name: string;
  icon: React.ReactNode;
  description: string;
  colorClass: string;
  defaults: {
    motionSensitivity: number;
    audioSensitivity: number;
    inactivityMinutes: number;
  };
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'baby',
    name: 'Baby Monitoring',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M20 21a8 8 0 1 0-16 0" />
      </svg>
    ),
    description: 'Optimized for infant detection and cry monitoring',
    colorClass: 'pink',
    defaults: { motionSensitivity: 35, audioSensitivity: 40, inactivityMinutes: 30 },
  },
  {
    id: 'pet',
    name: 'Pet Monitoring',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="4" r="2" />
        <circle cx="18" cy="8" r="2" />
        <circle cx="20" cy="16" r="2" />
        <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
      </svg>
    ),
    description: 'Balanced sensitivity for pets',
    colorClass: 'amber',
    defaults: { motionSensitivity: 40, audioSensitivity: 50, inactivityMinutes: 60 },
  },
  {
    id: 'elderly',
    name: 'Elderly Care',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="5" r="3" />
        <path d="M12 8v4m0 0-2 8m2-8 2 8" />
        <path d="M6 13h4m4 0h4" />
      </svg>
    ),
    description: 'Fall detection and wellness monitoring',
    colorClass: 'blue',
    defaults: { motionSensitivity: 30, audioSensitivity: 35, inactivityMinutes: 45 },
  },
  {
    id: 'security',
    name: 'Security',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    description: 'Intrusion detection focus',
    colorClass: 'red',
    defaults: { motionSensitivity: 95, audioSensitivity: 85, inactivityMinutes: 0 },
  },
];

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  info: 'blue',
  low: 'emerald',
  medium: 'yellow',
  high: 'orange',
  critical: 'red',
};

// =============================================================================
// Detection Settings Page
// =============================================================================

export default function DetectionSettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [expandedScenario, setExpandedScenario] = useState<ScenarioType | null>(null);

  const {
    globalSettings,
    updateGlobalSettings,
    audioSettings,
    updateAudioSettings,
    detectionFeatureSettings,
    updateDetectionFeatureSettings,
    scenarioOverrides,
    setScenarioOverride,
  } = useSettingsStore();

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

  const toggleScenario = (scenarioId: ScenarioType) => {
    setExpandedScenario(expandedScenario === scenarioId ? null : scenarioId);
  };

  const getScenarioOverride = (scenarioId: ScenarioType) => {
    return scenarioOverrides[scenarioId] || {};
  };

  const updateScenarioOverride = (scenarioId: ScenarioType, field: string, value: number) => {
    const current = getScenarioOverride(scenarioId);
    setScenarioOverride(scenarioId, { ...current, [field]: value });
  };

  const resetScenarioToDefaults = (scenario: ScenarioConfig) => {
    setScenarioOverride(scenario.id, null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="p-4 sm:p-6 border-b border-slate-700/50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton
              fallbackHref="/settings"
              ariaLabel="Back to settings"
              className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Detection Settings</h1>
              <p className="text-sm text-slate-400">Configure detection types and monitoring behavior</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

        {/* Section 1: Detection Type Toggles */}
        <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Detection Types</h2>
          <p className="text-sm text-slate-400 mb-6">
            Enable or disable different detection methods. AI detection requires model download.
          </p>

          <div className="space-y-4">
            {/* Motion Detection */}
            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
              <div className="flex-1 min-w-0 pr-4">
                <div className="text-sm font-medium text-white">Motion Detection</div>
                <div className="text-xs text-slate-400">Pixel-based frame analysis for movement</div>
              </div>
              <button
                role="switch"
                aria-checked={globalSettings.motionDetectionEnabled}
                aria-label="Toggle motion detection"
                onClick={() => updateGlobalSettings({ motionDetectionEnabled: !globalSettings.motionDetectionEnabled })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  globalSettings.motionDetectionEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  globalSettings.motionDetectionEnabled ? 'left-8' : 'left-1'
                }`} />
              </button>
            </div>

            {/* Pixel Detection */}
            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
              <div className="flex-1 min-w-0 pr-4">
                <div className="text-sm font-medium text-white">Pixel Detection</div>
                <div className="text-xs text-slate-400">Ultra-sensitive for sleep monitoring</div>
              </div>
              <button
                role="switch"
                aria-checked={globalSettings.pixelDetectionEnabled}
                aria-label="Toggle pixel detection"
                onClick={() => updateGlobalSettings({ pixelDetectionEnabled: !globalSettings.pixelDetectionEnabled })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  globalSettings.pixelDetectionEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  globalSettings.pixelDetectionEnabled ? 'left-8' : 'left-1'
                }`} />
              </button>
            </div>

            {/* Person Detection */}
            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">Person Detection</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">AI</span>
                </div>
                <div className="text-xs text-slate-400">TensorFlow.js COCO-SSD model (18.6 MB)</div>
              </div>
              <button
                role="switch"
                aria-checked={detectionFeatureSettings.personDetectionEnabled}
                aria-label="Toggle person detection"
                onClick={() => updateDetectionFeatureSettings({ personDetectionEnabled: !detectionFeatureSettings.personDetectionEnabled })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  detectionFeatureSettings.personDetectionEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  detectionFeatureSettings.personDetectionEnabled ? 'left-8' : 'left-1'
                }`} />
              </button>
            </div>

            {/* Animal Detection */}
            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">Animal Detection</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">AI</span>
                </div>
                <div className="text-xs text-slate-400">Detect dogs, cats, and wildlife</div>
              </div>
              <button
                role="switch"
                aria-checked={detectionFeatureSettings.animalDetectionEnabled}
                aria-label="Toggle animal detection"
                onClick={() => updateDetectionFeatureSettings({ animalDetectionEnabled: !detectionFeatureSettings.animalDetectionEnabled })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  detectionFeatureSettings.animalDetectionEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  detectionFeatureSettings.animalDetectionEnabled ? 'left-8' : 'left-1'
                }`} />
              </button>
            </div>

            {/* Audio Detection */}
            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
              <div className="flex-1 min-w-0 pr-4">
                <div className="text-sm font-medium text-white">Audio Detection</div>
                <div className="text-xs text-slate-400">Monitor sound levels and patterns</div>
              </div>
              <button
                role="switch"
                aria-checked={globalSettings.audioDetectionEnabled}
                aria-label="Toggle audio detection"
                onClick={() => updateGlobalSettings({ audioDetectionEnabled: !globalSettings.audioDetectionEnabled })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  globalSettings.audioDetectionEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  globalSettings.audioDetectionEnabled ? 'left-8' : 'left-1'
                }`} />
              </button>
            </div>
          </div>
        </section>

        {/* Section 2: Audio Frequency Filtering */}
        <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Audio Frequency Filtering</h2>
          <p className="text-sm text-slate-400 mb-6">
            Focus on specific sound patterns for better detection accuracy.
          </p>

          <div className="space-y-3">
            {[
              { value: 'all', label: 'All Frequencies', description: 'Monitor all audio frequencies (default)' },
              { value: 'baby_cry', label: 'Baby Cry Detection', description: 'Optimized for 300-600Hz infant vocalizations' },
              { value: 'pet_sounds', label: 'Pet Sounds', description: 'Barking, whining, and distress sounds' },
              { value: 'elderly_fall', label: 'Elderly Fall Detection', description: 'Impact sounds and calls for help' },
              { value: 'custom', label: 'Custom Range', description: 'Define your own frequency range' },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-colors ${
                  audioSettings.frequencyRange === option.value
                    ? 'bg-emerald-500/10 border border-emerald-500/50'
                    : 'bg-slate-900/50 border border-transparent hover:bg-slate-900/70'
                }`}
              >
                <input
                  type="radio"
                  name="frequencyRange"
                  value={option.value}
                  checked={audioSettings.frequencyRange === option.value}
                  onChange={() => updateAudioSettings({ frequencyRange: option.value as typeof audioSettings.frequencyRange })}
                  className="mt-1 w-4 h-4 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                />
                <div>
                  <div className="text-sm font-medium text-white">{option.label}</div>
                  <div className="text-xs text-slate-400">{option.description}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Custom Frequency Range Sliders */}
          {audioSettings.frequencyRange === 'custom' && (
            <div className="mt-6 space-y-4 p-4 bg-slate-900/50 rounded-lg">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Low Frequency</span>
                  <span className="text-emerald-400 font-mono">{audioSettings.customLowFreq} Hz</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={2000}
                  step={10}
                  value={audioSettings.customLowFreq}
                  onChange={(e) => updateAudioSettings({ customLowFreq: Number(e.target.value) })}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                             [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-emerald-500
                             [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  aria-label="Low frequency"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">High Frequency</span>
                  <span className="text-emerald-400 font-mono">{audioSettings.customHighFreq} Hz</span>
                </div>
                <input
                  type="range"
                  min={2000}
                  max={20000}
                  step={100}
                  value={audioSettings.customHighFreq}
                  onChange={(e) => updateAudioSettings({ customHighFreq: Number(e.target.value) })}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                             [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-emerald-500
                             [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  aria-label="High frequency"
                />
              </div>
            </div>
          )}

          {/* Background Noise Filter */}
          <div className="mt-4 flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-white">Background Noise Filter</div>
              <div className="text-xs text-slate-400">Reduce false positives from ambient noise</div>
            </div>
            <button
              role="switch"
              aria-checked={audioSettings.backgroundNoiseFilter}
              aria-label="Toggle background noise filter"
              onClick={() => updateAudioSettings({ backgroundNoiseFilter: !audioSettings.backgroundNoiseFilter })}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                audioSettings.backgroundNoiseFilter ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                audioSettings.backgroundNoiseFilter ? 'left-8' : 'left-1'
              }`} />
            </button>
          </div>
        </section>

        {/* Section 3: Person Detection Config (conditional) */}
        {detectionFeatureSettings.personDetectionEnabled && (
          <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Person Detection Configuration</h2>
            <p className="text-sm text-slate-400 mb-6">
              Fine-tune AI person detection settings.
            </p>

            {/* Info Box */}
            <div className="mb-6 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <h3 className="text-sm font-medium text-amber-300 mb-1">About Confidence Threshold</h3>
              <p className="text-xs text-slate-400">
                Higher confidence reduces false positives but may miss some detections.
                Lower confidence is more sensitive but may trigger on non-person objects.
              </p>
            </div>

            <div className="space-y-6">
              {/* Confidence Threshold */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-300">Confidence Threshold</span>
                  <span className="text-emerald-400 font-medium">{Math.round(detectionFeatureSettings.personConfidenceThreshold * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={detectionFeatureSettings.personConfidenceThreshold * 100}
                  onChange={(e) => updateDetectionFeatureSettings({ personConfidenceThreshold: Number(e.target.value) / 100 })}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                             [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-emerald-500
                             [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  aria-label="Person detection confidence threshold"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>More sensitive</span>
                  <span>More accurate</span>
                </div>
              </div>

              {/* Max Detections */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-300">Max Detections</span>
                  <span className="text-emerald-400 font-medium">{detectionFeatureSettings.maxPersonDetections}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={detectionFeatureSettings.maxPersonDetections}
                  onChange={(e) => updateDetectionFeatureSettings({ maxPersonDetections: Number(e.target.value) })}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                             [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-emerald-500
                             [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  aria-label="Maximum person detections"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Maximum number of people to detect per frame
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Section 4: Per-Scenario Detection Overrides */}
        <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Per-Scenario Overrides</h2>
          <p className="text-sm text-slate-400 mb-6">
            Customize detection sensitivity for each monitoring scenario.
          </p>

          <div className="space-y-3">
            {SCENARIOS.map((scenario) => {
              const override = getScenarioOverride(scenario.id);
              const isExpanded = expandedScenario === scenario.id;
              const hasOverride = Object.keys(override).length > 0;

              return (
                <div
                  key={scenario.id}
                  className={`rounded-lg border transition-colors ${
                    isExpanded
                      ? `bg-${scenario.colorClass}-500/5 border-${scenario.colorClass}-500/30`
                      : 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600/50'
                  }`}
                >
                  <button
                    onClick={() => toggleScenario(scenario.id)}
                    className="w-full flex items-center justify-between p-4 text-left min-h-[60px]"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl" aria-hidden="true">{scenario.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{scenario.name}</span>
                          {hasOverride && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${scenario.colorClass}-500/20 text-${scenario.colorClass}-400`}>
                              Modified
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">{scenario.description}</div>
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4">
                      {/* Motion Sensitivity */}
                      <div>
                        <div className="flex justify-between text-xs mb-2">
                          <span className="text-slate-400">Motion Sensitivity</span>
                          <span className="text-blue-400 font-mono">
                            {(override as { motionSensitivity?: number }).motionSensitivity ?? scenario.defaults.motionSensitivity}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={(override as { motionSensitivity?: number }).motionSensitivity ?? scenario.defaults.motionSensitivity}
                          onChange={(e) => updateScenarioOverride(scenario.id, 'motionSensitivity', Number(e.target.value))}
                          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                                     [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-blue-500
                                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                          aria-label={`${scenario.name} motion sensitivity`}
                        />
                      </div>

                      {/* Audio Sensitivity */}
                      <div>
                        <div className="flex justify-between text-xs mb-2">
                          <span className="text-slate-400">Audio Sensitivity</span>
                          <span className="text-purple-400 font-mono">
                            {(override as { audioSensitivity?: number }).audioSensitivity ?? scenario.defaults.audioSensitivity}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={(override as { audioSensitivity?: number }).audioSensitivity ?? scenario.defaults.audioSensitivity}
                          onChange={(e) => updateScenarioOverride(scenario.id, 'audioSensitivity', Number(e.target.value))}
                          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                                     [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-purple-500
                                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                          aria-label={`${scenario.name} audio sensitivity`}
                        />
                      </div>

                      {/* Reset Button */}
                      <button
                        onClick={() => resetScenarioToDefaults(scenario)}
                        className="w-full py-2 text-xs text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors"
                      >
                        Reset to defaults
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 5: Inactivity Monitoring */}
        <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Inactivity Monitoring</h2>
          <p className="text-sm text-slate-400 mb-6">
            Alert when no movement is detected for a specified duration.
          </p>

          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg mb-4">
            <div>
              <div className="text-sm font-medium text-white">Enable Inactivity Alerts</div>
              <div className="text-xs text-slate-400">Get notified when no movement is detected</div>
            </div>
            <button
              role="switch"
              aria-checked={detectionFeatureSettings.inactivityMonitoringEnabled}
              aria-label="Toggle inactivity monitoring"
              onClick={() => updateDetectionFeatureSettings({ inactivityMonitoringEnabled: !detectionFeatureSettings.inactivityMonitoringEnabled })}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                detectionFeatureSettings.inactivityMonitoringEnabled ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                detectionFeatureSettings.inactivityMonitoringEnabled ? 'left-8' : 'left-1'
              }`} />
            </button>
          </div>

          {/* Inactivity Settings (conditional) */}
          {detectionFeatureSettings.inactivityMonitoringEnabled && (
            <div className="space-y-6 p-4 bg-slate-900/50 rounded-lg">
              {/* Alert After */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-300">Alert After</span>
                  <span className="text-emerald-400 font-medium">{detectionFeatureSettings.inactivityAlertMinutes} minutes</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={60}
                  value={detectionFeatureSettings.inactivityAlertMinutes}
                  onChange={(e) => updateDetectionFeatureSettings({ inactivityAlertMinutes: Number(e.target.value) })}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                             [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-emerald-500
                             [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  aria-label="Inactivity alert minutes"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>1 min</span>
                  <span>60 min</span>
                </div>
              </div>

              {/* Alert Severity */}
              <div>
                <div className="text-sm text-slate-300 mb-3">Alert Severity</div>
                <div className="flex flex-wrap gap-2">
                  {(['info', 'low', 'medium', 'high', 'critical'] as AlertSeverity[]).map((severity) => {
                    const isSelected = detectionFeatureSettings.inactivitySeverity === severity;
                    const color = SEVERITY_COLORS[severity];
                    return (
                      <button
                        key={severity}
                        onClick={() => updateDetectionFeatureSettings({ inactivitySeverity: severity })}
                        aria-pressed={isSelected}
                        className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors min-h-[44px] ${
                          isSelected
                            ? `bg-${color}-500/20 text-${color}-400 border border-${color}-500/50`
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {severity}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

/**
 * Preset Info Modal Component
 *
 * Detailed modal explaining all monitoring modes, how pixel detection works,
 * when to use each mode, and the difference between local and AI processing.
 *
 * @module components/PresetInfoModal
 */

'use client';

import React from 'react';
import {
  DEFAULT_PRESETS,
  PresetId,
  SLEEP_PRESETS,
  isSleepPreset,
  getProcessingModeInfo,
  type SecurityPreset,
} from '../stores/settings-store';
import { IconX, IconInfo, IconShield, IconCamera, IconBell } from './icons';

// =============================================================================
// Types
// =============================================================================

interface PresetInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// Mode Card Component
// =============================================================================

interface ModeCardProps {
  preset: SecurityPreset;
  icon?: string;
  useCase: string;
  isSleep?: boolean;
}

function ModeCard({ preset, icon, useCase, isSleep }: ModeCardProps) {
  const processingInfo = getProcessingModeInfo(preset.processingMode);

  const processingColors = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  };

  return (
    <div className={`
      p-4 rounded-lg border transition-colors
      ${isSleep
        ? 'bg-purple-500/5 border-purple-500/20 hover:border-purple-500/40'
        : 'bg-[var(--color-steel-900)] border-[var(--color-steel-700)] hover:border-[var(--color-steel-600)]'}
    `}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-xl">{icon}</span>}
        <h4 className="font-semibold text-[var(--color-steel-100)]">
          {preset.name}
        </h4>
        {isSleep && (
          <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider
                          bg-purple-500/20 text-purple-400 rounded">
            Sleep
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--color-steel-400)] mb-3">
        {preset.description}
      </p>

      {/* Use Case */}
      <div className="text-xs text-[var(--color-steel-500)] mb-3 italic">
        Best for: {useCase}
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        {/* Pixel Threshold */}
        {preset.useAbsoluteThreshold && (
          <span className="px-2 py-1 text-xs font-mono bg-emerald-500/10 text-emerald-400
                          border border-emerald-500/30 rounded">
            {preset.absolutePixelThreshold}px threshold
          </span>
        )}

        {/* Processing Mode */}
        <span className={`px-2 py-1 text-xs font-medium border rounded ${processingColors[processingInfo.color]}`}>
          {processingInfo.label}
        </span>

        {/* Interval */}
        <span className="px-2 py-1 text-xs bg-[var(--color-steel-800)] text-[var(--color-steel-400)]
                        border border-[var(--color-steel-700)] rounded">
          Every {preset.analysisInterval}s
        </span>

        {/* Alert Delay */}
        {preset.alertDelay === 0 ? (
          <span className="px-2 py-1 text-xs bg-amber-500/10 text-amber-400
                          border border-amber-500/30 rounded">
            Instant alerts
          </span>
        ) : (
          <span className="px-2 py-1 text-xs bg-[var(--color-steel-800)] text-[var(--color-steel-400)]
                          border border-[var(--color-steel-700)] rounded">
            {preset.alertDelay}s delay
          </span>
        )}

        {/* Emergency Mode */}
        {preset.emergencyMode && (
          <span className="px-2 py-1 text-xs bg-red-500/10 text-red-400
                          border border-red-500/30 rounded">
            Emergency ON
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Section Component
// =============================================================================

interface SectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, icon, children }: SectionProps) {
  return (
    <section className="mb-8">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-steel-100)] mb-4">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function PresetInfoModal({ isOpen, onClose }: PresetInfoModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preset-info-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto
                      bg-[var(--color-steel-950)] border border-[var(--color-steel-800)]
                      rounded-xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-6
                        bg-[var(--color-steel-950)] border-b border-[var(--color-steel-800)]">
          <h2
            id="preset-info-title"
            className="text-xl font-bold text-[var(--color-steel-100)]
                       font-[family-name:var(--font-space-grotesk)]"
          >
            Understanding Monitoring Modes
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-steel-400)] hover:text-[var(--color-steel-100)]
                       hover:bg-[var(--color-steel-800)] rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Sleep Monitoring Section */}
          <Section
            title="Sleep Monitoring Modes"
            icon={<span className="text-purple-400">&#128164;</span>}
          >
            <p className="text-sm text-[var(--color-steel-400)] mb-4">
              Sleep modes use <strong className="text-emerald-400">pixel detection</strong> to
              alert you when your sleeping baby or pet moves. They run 100% locally for instant
              response with zero latency.
            </p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <ModeCard
                preset={SLEEP_PRESETS.infant_sleep}
                icon="&#128118;"
                useCase="Newborns, infants in cribs, co-sleeping arrangements"
                isSleep
              />
              <ModeCard
                preset={SLEEP_PRESETS.pet_sleep}
                icon="&#128054;"
                useCase="Dogs, cats, or other pets resting in their beds"
                isSleep
              />
              <ModeCard
                preset={SLEEP_PRESETS.deep_sleep_minimal}
                icon="&#128680;"
                useCase="When any movement at all should raise an alert"
                isSleep
              />
            </div>
          </Section>

          {/* General Modes Section */}
          <Section
            title="General Modes"
            icon={<IconShield size={20} className="text-emerald-400" />}
          >
            <p className="text-sm text-[var(--color-steel-400)] mb-4">
              Standard monitoring modes for everyday use. Choose based on your environment
              and sensitivity needs.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <ModeCard
                preset={DEFAULT_PRESETS.silent}
                icon="&#128263;"
                useCase="Libraries, quiet offices, sleeping partners nearby"
              />
              <ModeCard
                preset={DEFAULT_PRESETS.night}
                icon="&#127769;"
                useCase="Overnight monitoring, reduced disturbance"
              />
              <ModeCard
                preset={DEFAULT_PRESETS.maximum}
                icon="&#128276;"
                useCase="Active daytime monitoring, high-traffic areas"
              />
              <ModeCard
                preset={DEFAULT_PRESETS.ultimate}
                icon="&#128680;"
                useCase="Emergency situations, maximum security needed"
              />
            </div>
          </Section>

          {/* How Pixel Detection Works */}
          <Section
            title="How Pixel Detection Works"
            icon={<IconCamera size={20} className="text-blue-400" />}
          >
            <div className="p-4 bg-[var(--color-steel-900)] border border-[var(--color-steel-700)] rounded-lg">
              <p className="text-sm text-[var(--color-steel-300)] mb-4">
                The app compares consecutive video frames and measures how many pixels changed
                position. A lower threshold means even tiny movements trigger alerts, while
                higher thresholds only respond to significant movement.
              </p>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-3 bg-[var(--color-steel-800)] rounded-lg">
                  <div className="text-2xl font-bold font-mono text-emerald-400 mb-1">3px</div>
                  <div className="text-xs text-[var(--color-steel-400)]">
                    <strong>Ultra-sensitive</strong>
                    <br />
                    Detects the smallest movements, such as slight twitches. Expect more
                    false alerts from light and camera noise.
                  </div>
                </div>
                <div className="p-3 bg-[var(--color-steel-800)] rounded-lg">
                  <div className="text-2xl font-bold font-mono text-amber-400 mb-1">5px</div>
                  <div className="text-xs text-[var(--color-steel-400)]">
                    <strong>High sensitivity</strong>
                    <br />
                    Ideal for infant sleep monitoring. Catches most movements while
                    ignoring minor camera noise.
                  </div>
                </div>
                <div className="p-3 bg-[var(--color-steel-800)] rounded-lg">
                  <div className="text-2xl font-bold font-mono text-blue-400 mb-1">10px</div>
                  <div className="text-xs text-[var(--color-steel-400)]">
                    <strong>Balanced sensitivity</strong>
                    <br />
                    Good for pet monitoring. Ignores small twitches and alerts on
                    actual movement.
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* Processing Modes */}
          <Section
            title="Processing Modes"
            icon={<IconInfo size={20} className="text-amber-400" />}
          >
            <div className="space-y-3">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider
                                  bg-emerald-500/20 text-emerald-400 rounded">
                    LOCAL INSTANT
                  </span>
                </div>
                <p className="text-sm text-[var(--color-steel-300)]">
                  100% on-device processing. No internet required. Zero latency.
                  Your video never leaves your device. All sleep modes use this for instant response.
                </p>
              </div>

              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider
                                  bg-blue-500/20 text-blue-400 rounded">
                    HYBRID
                  </span>
                </div>
                <p className="text-sm text-[var(--color-steel-300)]">
                  Instant local detection for immediate alerts, plus AI enhancement queued
                  in the background for more accurate analysis. Best of both worlds.
                </p>
              </div>

              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider
                                  bg-amber-500/20 text-amber-400 rounded">
                    AI QUEUE
                  </span>
                </div>
                <p className="text-sm text-[var(--color-steel-300)]">
                  Advanced AI analysis for the most accurate detection. May have slight
                  delays based on server load. Not recommended for time-critical monitoring.
                </p>
              </div>
            </div>
          </Section>

          {/* Keyboard Shortcuts */}
          <Section
            title="Quick Switching"
            icon={<IconBell size={20} className="text-purple-400" />}
          >
            <p className="text-sm text-[var(--color-steel-400)] mb-3">
              Use keyboard shortcuts to quickly switch between presets:
            </p>
            <div className="flex flex-wrap gap-2">
              <kbd className="px-2 py-1 bg-[var(--color-steel-800)] text-[var(--color-steel-300)]
                             border border-[var(--color-steel-700)] rounded font-mono text-sm">
                1
              </kbd>
              <span className="text-sm text-[var(--color-steel-500)]">Silent</span>
              <span className="text-[var(--color-steel-700)]">|</span>
              <kbd className="px-2 py-1 bg-[var(--color-steel-800)] text-[var(--color-steel-300)]
                             border border-[var(--color-steel-700)] rounded font-mono text-sm">
                2
              </kbd>
              <span className="text-sm text-[var(--color-steel-500)]">Night</span>
              <span className="text-[var(--color-steel-700)]">|</span>
              <kbd className="px-2 py-1 bg-[var(--color-steel-800)] text-[var(--color-steel-300)]
                             border border-[var(--color-steel-700)] rounded font-mono text-sm">
                3
              </kbd>
              <span className="text-sm text-[var(--color-steel-500)]">Maximum</span>
              <span className="text-[var(--color-steel-700)]">|</span>
              <kbd className="px-2 py-1 bg-[var(--color-steel-800)] text-[var(--color-steel-300)]
                             border border-[var(--color-steel-700)] rounded font-mono text-sm">
                4
              </kbd>
              <span className="text-sm text-[var(--color-steel-500)]">Ultimate</span>
              <span className="text-[var(--color-steel-700)]">|</span>
              <kbd className="px-2 py-1 bg-[var(--color-steel-800)] text-[var(--color-steel-300)]
                             border border-[var(--color-steel-700)] rounded font-mono text-sm">
                5
              </kbd>
              <span className="text-sm text-[var(--color-steel-500)]">Infant Sleep</span>
            </div>
            <p className="text-xs text-[var(--color-steel-600)] mt-2">
              Press <kbd className="px-1 bg-[var(--color-steel-800)] rounded">?</kbd> anytime
              to see all keyboard shortcuts.
            </p>
          </Section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 p-4 bg-[var(--color-steel-950)] border-t border-[var(--color-steel-800)]">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600
                       text-white font-medium rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export default PresetInfoModal;

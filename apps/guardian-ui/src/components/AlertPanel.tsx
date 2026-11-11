/**
 * Alert Panel Component
 *
 * Displays active alerts with escalation management.
 *
 * @module components/AlertPanel
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMonitoringStore, type Alert } from '../stores/monitoring-store';
import { isStaticMode, getApiUrl } from '../lib/env';
import { useSettingsStore } from '../stores/settings-store';
import { getSoundManager, type SoundType } from '../lib/sound-manager';
import {
  IconInfo,
  IconBell,
  IconAlertTriangle,
  IconSiren,
  IconShieldAlert,
  IconVolume,
  IconVolumeOff,
  IconCheck,
  IconChevronUp,
  IconChevronDown,
} from './icons';

// =============================================================================
// Types
// =============================================================================

// Re-export for backwards compatibility
export type { Alert };

interface AlertPanelProps {
  alerts?: Alert[];
  onAcknowledge?: (alertId: string) => void;
}

// =============================================================================
// Constants
// =============================================================================

const SEVERITY_COLORS: Record<
  Alert['severity'],
  { bg: string; border: string; text: string }
> = {
  info: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400' },
  low: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400' },
  medium: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-400' },
  high: { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400' },
  critical: { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400' },
};

const SEVERITY_ICONS: Record<Alert['severity'], React.ComponentType<{ size?: number; className?: string }>> = {
  info: IconInfo,
  low: IconBell,
  medium: IconAlertTriangle,
  high: IconSiren,
  critical: IconShieldAlert,
};

// =============================================================================
// AlertPanel Component
// =============================================================================

export function AlertPanel({ alerts: propAlerts, onAcknowledge }: AlertPanelProps) {
  const storeAlerts = useMonitoringStore((state) => state.alerts);
  const removeAlert = useMonitoringStore((state) => state.removeAlert);
  const effectiveVolume = useSettingsStore((state) => state.getEffectiveVolume());
  const globalMute = useSettingsStore((state) => state.globalMute);
  const emergencyModeActive = useSettingsStore((state) => state.emergencyModeActive);
  const escalationConfig = useSettingsStore((state) => state.alertEscalationLevels);
  
  const alerts = propAlerts || storeAlerts || [];
  const [escalationLevels, setEscalationLevels] = useState<Map<string, number>>(new Map());
  const escalationLevelsRef = useRef<Map<string, number>>(new Map());
  const [muted, setMuted] = useState(false);
  const emergencyLoopSoundIdRef = useRef<string | null>(null);
  const effectiveMuted = (muted || globalMute) && !emergencyModeActive;

  // Escalation engine (tick-based) so sounds reliably fire at level boundaries.
  useEffect(() => {
    const sortedLevels = [...(escalationConfig || [])].sort((a, b) => a.level - b.level);
    const maxLevel = sortedLevels.reduce((max, l) => Math.max(max, l.level), 1);

    const getLevelForAgeMs = (ageMs: number): number => {
      if (sortedLevels.length === 0) return 1;

      let cumulativeMs = 0;
      let level = sortedLevels[0]?.level ?? 1;

      for (const cfg of sortedLevels) {
        if (cfg.level === sortedLevels[0]?.level) {
          level = cfg.level;
          continue;
        }

        cumulativeMs += Math.max(0, cfg.delaySeconds) * 1000;
        if (ageMs >= cumulativeMs) {
          level = cfg.level;
        }
      }

      return level;
    };

    const cfgByLevel = new Map(sortedLevels.map((l) => [l.level, l]));

    const playLevel = (level: number) => {
      const cfg = cfgByLevel.get(level);
      if (!cfg) return;

      const soundType = cfg.soundType as SoundType;
      const isEmergencyLevel = level >= maxLevel;
      const allowSound = isEmergencyLevel || (!muted && effectiveVolume > 0);
      if (!allowSound) return;

      const volume = isEmergencyLevel
        ? 100
        : Math.max(0, Math.min(100, effectiveVolume * cfg.volumeMultiplier));

      const id = getSoundManager().play(soundType, {
        loop: isEmergencyLevel,
        forceMaxVolume: isEmergencyLevel && soundType === 'emergency',
        volume,
      });

      if (isEmergencyLevel && !emergencyLoopSoundIdRef.current) {
        emergencyLoopSoundIdRef.current = id;
      }
    };

    const tick = () => {
      const now = Date.now();
      const unacknowledged = alerts.filter((a) => !a.acknowledged);

      const nextLevels = new Map<string, number>();

      for (const alert of unacknowledged) {
        const alertTime = alert.createdAt || alert.timestamp || new Date().toISOString();
        const ageMs = Math.max(0, now - new Date(alertTime).getTime());
        const targetLevel = getLevelForAgeMs(ageMs);
        const prevLevel = escalationLevelsRef.current.get(alert.id) ?? 0;
        const nextLevel = Math.max(prevLevel, targetLevel);

        nextLevels.set(alert.id, nextLevel);

        if (nextLevel > prevLevel) {
          playLevel(nextLevel);
        }
      }

      const prevLevels = escalationLevelsRef.current;
      let changed = prevLevels.size !== nextLevels.size;

      if (!changed) {
        for (const [id, level] of nextLevels) {
          if ((prevLevels.get(id) ?? 0) !== level) {
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        escalationLevelsRef.current = nextLevels;
        setEscalationLevels(nextLevels);
      }

      const hasEmergency = Array.from(nextLevels.values()).some((level) => level >= maxLevel);
      if (hasEmergency) {
        if (!emergencyLoopSoundIdRef.current) {
          const cfg = cfgByLevel.get(maxLevel);
          const soundType = (cfg?.soundType as SoundType) || 'emergency';
          const volume = 100;
          emergencyLoopSoundIdRef.current = getSoundManager().play(soundType, {
            loop: true,
            forceMaxVolume: soundType === 'emergency',
            volume,
          });
        }
      } else if (emergencyLoopSoundIdRef.current) {
        getSoundManager().stop(emergencyLoopSoundIdRef.current);
        emergencyLoopSoundIdRef.current = null;
      }
    };

    tick();
    const interval = window.setInterval(tick, 500);
    return () => {
      window.clearInterval(interval);
      if (emergencyLoopSoundIdRef.current) {
        getSoundManager().stop(emergencyLoopSoundIdRef.current);
        emergencyLoopSoundIdRef.current = null;
      }
    };
  }, [alerts, escalationConfig, effectiveVolume, muted]);

  // Handle acknowledge
  const handleAcknowledge = useCallback(
    async (alertId: string) => {
      try {
        // Remove from escalation tracking; the escalation tick will stop any looping
        // emergency audio once no emergency-level alerts remain.
        escalationLevelsRef.current.delete(alertId);
        setEscalationLevels((prev) => {
          const next = new Map(prev);
          next.delete(alertId);
          return next;
        });

        // Call API to acknowledge (skip in static mode)
        const apiUrl = getApiUrl();
        if (!isStaticMode() && apiUrl) {
          await fetch(
            `${apiUrl}/api/alerts/${alertId}/acknowledge`,
            { method: 'POST' }
          );
        }

        // Update store or call callback
        if (onAcknowledge) {
          onAcknowledge(alertId);
        } else {
          removeAlert(alertId);
        }
      } catch (error) {
        console.error('Failed to acknowledge alert:', error);
      }
    },
    [onAcknowledge, removeAlert]
  );

  // Toggle mute
  const toggleMute = () => {
    if (globalMute) return;
    setMuted(!muted);
    // Non-emergency sounds are one-shot; emergency is stopped via acknowledge.
  };

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged);
  const acknowledgedAlerts = alerts.filter((a) => a.acknowledged);

  // Get the most recent unacknowledged alert for screen reader announcement
  const latestAlert = unacknowledgedAlerts[0];

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Screen reader live region for alert announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {latestAlert && (
          <span>
            New {latestAlert.severity} alert: {latestAlert.message}.
            {unacknowledgedAlerts.length > 1 &&
              ` ${unacknowledgedAlerts.length} total unacknowledged alerts.`}
          </span>
        )}
        {unacknowledgedAlerts.length === 0 && 'No active alerts. All clear.'}
      </div>

      {/* Header */}
      <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <IconBell size={18} className="text-slate-400" aria-hidden="true" />
          Alerts
          {unacknowledgedAlerts.length > 0 && (
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs">
              {unacknowledgedAlerts.length}
            </span>
          )}
        </h3>
        <button
          onClick={toggleMute}
          disabled={globalMute}
          aria-label={effectiveMuted ? 'Unmute alerts' : 'Mute alerts'}
          aria-pressed={effectiveMuted}
          className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${
            effectiveMuted
              ? 'bg-red-500/20 text-red-400'
              : 'bg-slate-700/50 text-slate-400 hover:text-white'
          } ${globalMute ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {effectiveMuted ? (
            <IconVolumeOff size={20} aria-hidden="true" />
          ) : (
            <IconVolume size={20} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="max-h-[60vh] sm:max-h-[400px] overflow-y-auto">
        {alerts.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-slate-700/50">
            {/* Unacknowledged alerts */}
            {unacknowledgedAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                escalationLevel={escalationLevels.get(alert.id) || 1}
                onAcknowledge={handleAcknowledge}
              />
            ))}

            {/* Acknowledged alerts (collapsed) */}
            {acknowledgedAlerts.length > 0 && (
              <AcknowledgedSection alerts={acknowledgedAlerts} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface AlertCardProps {
  alert: Alert;
  escalationLevel: number;
  onAcknowledge: (id: string) => void;
}

function AlertCard({ alert, escalationLevel, onAcknowledge }: AlertCardProps) {
  const colors = SEVERITY_COLORS[alert.severity];
  const IconComponent = SEVERITY_ICONS[alert.severity];
  const alertTime = alert.createdAt || alert.timestamp || new Date().toISOString();
  const timeAgo = getTimeAgo(alertTime);

  // Escalation indicator
  const escalationColor =
    escalationLevel >= 4
      ? 'bg-red-500 animate-pulse'
      : escalationLevel >= 3
        ? 'bg-orange-500'
        : escalationLevel >= 2
          ? 'bg-yellow-500'
          : 'bg-emerald-500';

  return (
    <div className={`p-4 ${colors.bg} relative`}>
      {/* Escalation indicator */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${escalationColor}`}
      />

      <div className="flex gap-3">
        {/* Thumbnail */}
        {alert.thumbnailUrl && (
          <div className="w-16 h-16 rounded-lg bg-slate-700 overflow-hidden flex-shrink-0">
            <img
              src={alert.thumbnailUrl}
              alt="Alert thumbnail"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconComponent size={16} className={colors.text} aria-hidden="true" />
              <span className={`text-sm font-medium ${colors.text} capitalize`}>
                {alert.severity}
              </span>
            </div>
            <span className="text-xs text-slate-500">{timeAgo}</span>
          </div>

          <p className="text-sm text-white mt-1 line-clamp-2">{alert.message}</p>

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-500">
              Level {escalationLevel}
            </span>
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="px-4 py-2.5 min-h-[44px] bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium
                         hover:bg-emerald-500/30 active:bg-emerald-500/40 transition-colors
                         flex items-center justify-center"
            >
              Acknowledge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AcknowledgedSectionProps {
  alerts: Alert[];
}

function AcknowledgedSection({ alerts }: AcknowledgedSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-700/20">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${alerts.length} acknowledged alert${alerts.length !== 1 ? 's' : ''}`}
        className="w-full p-4 min-h-[52px] flex items-center justify-between text-slate-400 hover:text-white transition-colors"
      >
        <span className="text-sm">
          {alerts.length} acknowledged alert{alerts.length !== 1 ? 's' : ''}
        </span>
        {expanded ? (
          <IconChevronUp size={16} aria-hidden="true" />
        ) : (
          <IconChevronDown size={16} aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="divide-y divide-slate-700/30">
          {alerts.slice(0, 5).map((alert) => (
            <div key={alert.id} className="p-3 opacity-60">
              <div className="flex items-center gap-2 text-sm">
                {(() => {
                  const Icon = SEVERITY_ICONS[alert.severity];
                  return <Icon size={14} className="text-slate-400 flex-shrink-0" aria-hidden="true" />;
                })()}
                <span className="text-slate-300 truncate">{alert.message}</span>
                <span className="text-xs text-slate-500 ml-auto">
                  {getTimeAgo(alert.createdAt || alert.timestamp || new Date().toISOString())}
                </span>
              </div>
            </div>
          ))}
          {alerts.length > 5 && (
            <div className="p-3 text-center text-xs text-slate-500">
              + {alerts.length - 5} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  const isStreaming = useMonitoringStore(state => state.isStreaming);
  return (
    <div className="p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-3">
        <IconCheck size={24} className="text-emerald-500 opacity-50" aria-hidden="true" />
      </div>
      <p className="text-slate-400 text-sm">No active alerts</p>
      <p className="text-slate-500 text-xs mt-1">
        {isStreaming ? 'Monitoring is running normally' : 'Monitoring is inactive'}
      </p>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function getTimeAgo(timestamp: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000
  );

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default AlertPanel;

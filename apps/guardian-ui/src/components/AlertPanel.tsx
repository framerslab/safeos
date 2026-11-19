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
import { cardTime } from '../lib/alert-event';
import { kindOfAlert } from '../lib/alert-pictures/rules';
import { announceAlert, levelWords } from '../lib/alert-pictures/words';
import { PictureBlock, alertMoment } from './alert-pictures/PictureBlock';
import { ListLine } from './alert-pictures/ListLine';
import { KeyRow } from './alert-pictures/KeyRow';
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
  const acknowledgeAlert = useMonitoringStore((state) => state.acknowledgeAlert);
  const effectiveVolume = useSettingsStore((state) => state.getEffectiveVolume());
  const globalMute = useSettingsStore((state) => state.globalMute);
  const emergencyModeActive = useSettingsStore((state) => state.emergencyModeActive);
  const escalationConfig = useSettingsStore((state) => state.alertEscalationLevels);
  
  const alerts = propAlerts || storeAlerts || [];
  const [escalationLevels, setEscalationLevels] = useState<Map<string, number>>(new Map());
  const escalationLevelsRef = useRef<Map<string, number>>(new Map());
  const [muted, setMuted] = useState(false);
  // The loop that sounds for the top escalation level, and the sound it plays.
  const emergencyLoopRef = useRef<{ id: string; type: SoundType } | null>(null);
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

    const playLevel = (level: number, alert: Alert) => {
      const cfg = cfgByLevel.get(level);
      if (!cfg) return;

      // The top level sounds as the panel's one emergency loop, which the tick
      // below starts and stops for every alert at that level together.
      if (level >= maxLevel) return;

      // The alert's own level sets its volume: quiet hours in Emergency Only
      // sound a critical alert and silence the others.
      const critical = alert.severity === 'critical';
      const alertVolume = useSettingsStore.getState().getEffectiveVolume(alert.severity);
      const soundType = cfg.soundType as SoundType;
      if (muted || alertVolume <= 0) return;

      const volume = Math.max(0, Math.min(100, alertVolume * cfg.volumeMultiplier));
      getSoundManager().play(soundType, { loop: false, volume, critical });
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
          playLevel(nextLevel, alert);
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

      // One loop sounds while any unacknowledged alert is at the top level, and
      // it plays on through every run of this effect. A loop the sound module
      // does not hold is one that is not running, and is started again.
      const hasEmergency = Array.from(nextLevels.values()).some((level) => level >= maxLevel);
      const manager = getSoundManager();
      const loop = emergencyLoopRef.current;
      if (hasEmergency) {
        const cfg = cfgByLevel.get(maxLevel);
        const soundType = (cfg?.soundType as SoundType) || 'emergency';
        const playing = loop && manager.isActive(loop.id) ? loop : null;
        if (playing && playing.type !== soundType) {
          // The sound set for the top level changed: the old loop ends at once,
          // so the two never sound together.
          manager.stop(playing.id, 0);
        }
        if (!playing || playing.type !== soundType) {
          const volume = 100;
          const id = manager.play(soundType, {
            loop: true,
            forceMaxVolume: soundType === 'emergency',
            volume,
          });
          emergencyLoopRef.current = { id, type: soundType };
        }
      } else if (loop) {
        manager.stop(loop.id);
        emergencyLoopRef.current = null;
      }
    };

    tick();
    const interval = window.setInterval(tick, 500);
    // The loop is not stopped here: a new alert, an acknowledgement, a volume
    // change or a mute change runs this effect again, and the loop plays on.
    return () => window.clearInterval(interval);
  }, [alerts, escalationConfig, effectiveVolume, muted]);

  // The loop stops when the panel unmounts, at once: a fade would leave it
  // sounding beside the loop of a panel mounted next.
  useEffect(() => () => {
    const loop = emergencyLoopRef.current;
    if (loop) {
      getSoundManager().stop(loop.id, 0);
      emergencyLoopRef.current = null;
    }
  }, []);

  // Handle acknowledge
  const handleAcknowledge = useCallback(
    (alertId: string) => {
      // Remove from escalation tracking; the escalation tick will stop any looping
      // emergency audio once no emergency-level alerts remain.
      escalationLevelsRef.current.delete(alertId);
      setEscalationLevels((prev) => {
        const next = new Map(prev);
        next.delete(alertId);
        return next;
      });

      // The acknowledgement counts on this device whether or not a server answers,
      // and the alert stays in history marked acknowledged.
      if (onAcknowledge) {
        onAcknowledge(alertId);
      } else {
        acknowledgeAlert(alertId);
      }

      // Tell the server as well (skip in static mode)
      const apiUrl = getApiUrl();
      if (!isStaticMode() && apiUrl) {
        void fetch(`${apiUrl}/api/alerts/${alertId}/acknowledge`, { method: 'POST' }).catch((error) => {
          console.warn('[AlertPanel] The server did not record the acknowledgement:', error);
        });
      }
    },
    [onAcknowledge, acknowledgeAlert]
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
  // A Motion, Sound or Picture change alert is read by its kind, level and time, not by its numbers.
  const latestKind = latestAlert ? kindOfAlert(latestAlert) : null;

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
            {latestKind
              ? announceAlert(latestKind, latestAlert.severity, alertMoment(latestAlert))
              : `New ${latestAlert.severity} alert: ${latestAlert.message}.`}
            {/* A repeat often keeps the reading and severity; its count changes the words, so it is read. */}
            {(latestAlert.repeats ?? 0) > 0 &&
              ` Repeated ${latestAlert.repeats} ${latestAlert.repeats === 1 ? 'time' : 'times'}.`}
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

      {/* Said once: a device that ran out of room for pictures, or a window that keeps none */}
      <ListLine />

      {/* Content: every card stands whole and the list scrolls with the page */}
      <div>
        {alerts.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="alert-card-list">
            {/* Unacknowledged alerts: the newest shows its pictures large, the others a thumbnail */}
            {unacknowledgedAlerts.map((alert, index) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                form={index === 0 ? 'large' : 'small'}
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
  /** The picture block's form: large for the newest card, small for the others. */
  form: 'large' | 'small';
  escalationLevel: number;
  onAcknowledge: (id: string) => void;
}

/** The level's icon and word, and how long ago the card's newest alert came. */
function CardHead({ alert }: { alert: Alert }) {
  const IconComponent = SEVERITY_ICONS[alert.severity];
  // A card that counts repeats shows the time of its newest alert.
  const timeAgo = getTimeAgo(cardTime(alert) || new Date().toISOString());
  return (
    <div className="alert-card__head">
      <span className="alert-card__level">
        {/* The level's word carries the meaning; its icon is not read. */}
        <span className="alert-card__icon" aria-hidden="true"><IconComponent size={18} /></span>
        <span>{levelWords(alert.severity)}</span>
      </span>
      <span className="alert-card__ago">{timeAgo}</span>
    </div>
  );
}

function AlertCard({ alert, form, escalationLevel, onAcknowledge }: AlertCardProps) {
  const repeats = alert.repeats ?? 0;
  // A Motion, Sound or Picture change alert shows its picture block in place of its message line.
  const kind = kindOfAlert(alert);

  return (
    <div className="alert-card" data-alert-card="" data-form={kind ? form : undefined} data-severity={alert.severity}>
      {/* Escalation indicator: the fourth level pulses until the card is acknowledged */}
      <div
        className="alert-card__bar"
        data-escalation-bar=""
        data-level={Math.min(4, Math.max(1, escalationLevel))}
      />

      <CardHead alert={alert} />

      {kind ? (
        <PictureBlock alert={alert} form={form} />
      ) : (
        <div className="alert-card__picture">
          {alert.thumbnailUrl && (
            <img src={alert.thumbnailUrl} alt="Alert thumbnail" className="alert-card__thumbnail" />
          )}
          <p className="alert-card__message line-clamp-2">{alert.message}</p>
        </div>
      )}

      <div className="alert-card__foot">
        <span className="alert-card__counts">
          <span>Level {escalationLevel}</span>
          {repeats > 0 && <span>Repeated {repeats} {repeats === 1 ? 'time' : 'times'}</span>}
        </span>
        {/* The card's keys keep one row; where they do not fit, the row scrolls inside itself. */}
        <KeyRow className="alert-card__keys">
          <button type="button" onClick={() => onAcknowledge(alert.id)} className="alert-card__acknowledge">
            Acknowledge
          </button>
        </KeyRow>
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
          {/* An acknowledged card of a kind that keeps a picture shows it, at full strength */}
          {alerts.slice(0, 5).map((alert) => kindOfAlert(alert) ? (
            <div key={alert.id} className="alert-card" data-alert-card="" data-acknowledged="" data-form="small">
              <CardHead alert={alert} />
              <PictureBlock alert={alert} form="small" />
            </div>
          ) : (
            <div key={alert.id} className="p-3 opacity-60" data-alert-card="" data-acknowledged="">
              <div className="flex items-center gap-2 text-sm">
                {(() => {
                  const Icon = SEVERITY_ICONS[alert.severity];
                  return <Icon size={14} className="text-slate-400 flex-shrink-0" aria-hidden="true" />;
                })()}
                <span className="text-slate-300 truncate">{alert.message}</span>
                <span className="text-xs text-slate-500 ml-auto">
                  {getTimeAgo(cardTime(alert) || new Date().toISOString())}
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

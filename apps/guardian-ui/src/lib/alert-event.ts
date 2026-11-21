/**
 * One detector's alert event on the monitor (motion, sound or pixel change).
 *
 * An event starts when the detector's reading has stayed over its line for
 * the sustained window, and raises its first alert once the severity's
 * cooldown since the detector's last alert has passed. While readings stay
 * over the line the event goes on: it alerts again once the longer of the
 * severity's cooldown and the Cooldown Period has passed since its last
 * alert, and at once (after the severity's own cooldown, 0 for critical by
 * default) when its severity rises above that of its last alert. The event
 * ends once readings have stayed under the line for the sustained window,
 * or when monitoring stops or the detector is turned off.
 */

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

const RANK: Record<AlertSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** Seconds a severity waits when its cooldown setting cannot be read. */
const FALLBACK_SEVERITY_SECONDS = 10;
/** The Cooldown Period's default, used when its setting cannot be read. */
const FALLBACK_COOLDOWN_PERIOD_SECONDS = 30;

export interface DetectorEvent {
  /** The first reading over the line, while no event goes on. */
  aboveSince: number | null;
  /** The first reading under the line, while an event goes on. */
  belowSince: number | null;
  /** An event goes on: it has raised an alert and has not ended. */
  active: boolean;
  /** When this detector last alerted (kept across events). */
  lastAlertAt: number;
  /** The severity of the event's last alert. */
  lastSeverity: AlertSeverity | null;
  /** The highest severity the event has alerted at. */
  peakSeverity: AlertSeverity | null;
  /**
   * The event's notification identity: set as the event first alerts, kept
   * when its alerts go on a new card, cleared when the event ends.
   */
  notifyTag: string | null;
  /** The card the event's alerts update. */
  alertId: string | null;
  /** When the event's card was made. */
  startedAt: string | null;
  /** How many times the event alerted after its card was made. */
  repeats: number;
}

/**
 * The time a card shows and is listed by: for an event's card that alerted
 * again, the time of its newest alert (`timestamp`); otherwise when it was
 * raised. The card's `createdAt` stays the event's start, which escalation
 * counts from.
 */
export function cardTime(card: { createdAt?: string; timestamp?: string; repeats?: number }): string | undefined {
  return ((card.repeats ?? 0) > 0 && card.timestamp) || card.createdAt || card.timestamp;
}

/** A copy of `cards`, newest first by cardTime. */
export function newestFirst<T extends { createdAt?: string; timestamp?: string; repeats?: number }>(cards: T[]): T[] {
  const at = (card: T) => {
    const time = Date.parse(cardTime(card) ?? '');
    return Number.isFinite(time) ? time : 0;
  };
  return [...cards].sort((a, b) => at(b) - at(a));
}

/**
 * An event's notifications stay up until they are dismissed once it has
 * alerted at high or critical: a repeat at a lower severity replaces the
 * event's notification and must not let it close by itself.
 */
export function keepsNotificationUp(event: DetectorEvent): boolean {
  return event.peakSeverity === 'high' || event.peakSeverity === 'critical';
}

/**
 * The fresh card a repeat of `event` goes on when the card it found was
 * cleared or acknowledged in another tab: a new id from `newId`, starting at
 * `now`. The event moves to it when it is on the card found stale, so its
 * later repeats update the fresh card; an event that has moved on stays.
 */
export function freshCardFor(event: DetectorEvent, newId: () => string, now: number) {
  return (staleId: string): { id: string; createdAt: string } => {
    const next = { id: newId(), createdAt: new Date(now).toISOString() };
    if (event.alertId === staleId) {
      event.alertId = next.id;
      event.startedAt = next.createdAt;
      event.repeats = 0;
    }
    return next;
  };
}

export function newDetectorEvent(): DetectorEvent {
  return {
    aboveSince: null,
    belowSince: null,
    active: false,
    lastAlertAt: 0,
    lastSeverity: null,
    peakSeverity: null,
    notifyTag: null,
    alertId: null,
    startedAt: null,
    repeats: 0,
  };
}

/** Ends the event. The time of the last alert stays, so a new event keeps its severity's cooldown. */
export function endDetectorEvent(event: DetectorEvent): void {
  event.aboveSince = null;
  event.belowSince = null;
  event.active = false;
  event.lastSeverity = null;
  event.peakSeverity = null;
  event.notifyTag = null;
  event.alertId = null;
  event.startedAt = null;
  event.repeats = 0;
}

export interface AlertTiming {
  /** The severity's cooldown in seconds (Settings > Escalation). */
  severitySeconds: number | undefined;
  /** The Cooldown Period in seconds (the time between repeated alerts for one event). */
  cooldownPeriodSeconds: number;
  /** How long readings must stay over the line to start an event, and under it to end one. */
  sustainedMs: number;
  /** How long readings must stay under the line to end an event, where that differs from `sustainedMs`. */
  endSustainedMs?: number;
}

/**
 * - `quiet`: under the line, or over it for less than the sustained window.
 * - `held`: an event goes on, or is due, but its wait has not passed.
 * - `alert`: alert now. `repeat` is true when the alert belongs to an event
 *   that has alerted before.
 */
export type ReadingOutcome =
  | { kind: 'quiet' }
  | { kind: 'held' }
  | { kind: 'alert'; repeat: boolean };

function seconds(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

/**
 * Feeds one reading to the detector's event. `severity` is null for a
 * reading under the line. On `alert` the event is updated as having alerted
 * at `now`; the caller raises the alert.
 */
export function readDetector(
  event: DetectorEvent,
  now: number,
  severity: AlertSeverity | null,
  timing: AlertTiming,
): ReadingOutcome {
  const endAfterMs = timing.endSustainedMs ?? timing.sustainedMs;
  if (severity === null) {
    event.aboveSince = null;
    if (event.active) {
      if (event.belowSince === null) event.belowSince = now;
      if (now - event.belowSince >= endAfterMs) endDetectorEvent(event);
    }
    return { kind: 'quiet' };
  }

  if (event.active && event.belowSince !== null && now - event.belowSince >= endAfterMs) {
    // The quiet window passed between the last quiet sample and this reading:
    // the old event ended, and this reading starts a new one.
    endDetectorEvent(event);
  }
  event.belowSince = null;
  // Require sustained readings to avoid single-frame spikes and lighting flicker; with no
  // sustained window asked for (a sighting's check), the first reading over the line starts it.
  if (!event.active && timing.sustainedMs > 0) {
    if (event.aboveSince === null) {
      event.aboveSince = now;
      return { kind: 'quiet' };
    }
    if (now - event.aboveSince < timing.sustainedMs) return { kind: 'quiet' };
  }

  const severitySeconds = seconds(timing.severitySeconds, FALLBACK_SEVERITY_SECONDS);
  const period = seconds(timing.cooldownPeriodSeconds, 0) || FALLBACK_COOLDOWN_PERIOD_SECONDS;
  // A rise above the event's last alert is timed as a new event, so a rise
  // to critical (no cooldown by default) alerts at once.
  const rose = event.active && event.lastSeverity !== null && RANK[severity] > RANK[event.lastSeverity];
  const waitSeconds = event.active && !rose ? Math.max(severitySeconds, period) : severitySeconds;
  if (waitSeconds > 0 && now - event.lastAlertAt < waitSeconds * 1000) return { kind: 'held' };

  const repeat = event.active;
  event.active = true;
  event.aboveSince = null;
  event.lastAlertAt = now;
  event.lastSeverity = severity;
  if (event.peakSeverity === null || RANK[severity] > RANK[event.peakSeverity]) event.peakSeverity = severity;
  return { kind: 'alert', repeat };
}

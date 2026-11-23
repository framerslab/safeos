'use client';
/**
 * Mute alerts
 *
 * The key at the end of the watch's bar: a speaker and the words "Mute
 * alerts" in both states, pressed while alerts are muted. While muted, a line
 * under the bar's row says new alerts show without a sound, and that an alert
 * left unanswered until it reaches Emergency sounds its alarm all the same:
 * the sound module never mutes that alarm. The line stands outside the row,
 * which scrolls on its one line.
 *
 * @module components/watch/MuteAlerts
 */

import { SpeakerGlyph } from './Glyphs';

export const MUTED_LINE =
  'Alerts are muted. New alerts show here without a sound. One left unanswered until it reaches Emergency sounds its alarm.';

export function MuteAlerts({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="key key--outline watch-mute" aria-pressed={muted} onClick={onToggle}>
      <SpeakerGlyph crossed={muted} />
      <span>Mute alerts</span>
    </button>
  );
}

/** The line under the bar's row while alerts are muted. */
export function MutedLine({ muted }: { muted: boolean }) {
  return muted ? <p className="watch-muted">{MUTED_LINE}</p> : null;
}

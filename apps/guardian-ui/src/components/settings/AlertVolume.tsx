'use client';

/**
 * Alert volume: a slider row from 0 to 100 with its value, the line
 * "Unanswered alerts get louder from here." and a key that plays SafeOS's
 * Alert tone at that volume, reading Stop until the tone has played or Stop
 * is pressed. A move sets the volume the watch plays at and says Saved.
 *
 * @module components/settings/AlertVolume
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWatchSettings } from '@/stores/watch-settings';
import { getSoundManager, TONE_PATTERNS } from '@/lib/sound-manager';
import { useSaveNote } from '@/lib/settings-save';
import { useMounted } from '@/lib/use-mounted';
import { SliderRow } from './SliderRow';
import { SavedNote } from './SavedNote';
import { TestKey } from './TestKey';

// The Alert tone's length; the key reads Play again after it, should the
// browser never say the tone ended.
const TONE_MS = TONE_PATTERNS.alert.tones.reduce((sum, tone) => sum + tone.duration + tone.gapAfter, 0);

export function AlertVolume() {
  const mounted = useMounted();
  const { watchSettings, tuneWatch } = useWatchSettings();
  const volume = watchSettings.alertVolume;
  const { note, changed } = useSaveNote();
  const [playing, setPlaying] = useState(false);
  const toneId = useRef<string | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ended = useCallback(() => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    toneId.current = null;
    setPlaying(false);
  }, []);

  const stop = useCallback(() => {
    if (toneId.current) getSoundManager().stop(toneId.current);
    ended();
  }, [ended]);

  const play = useCallback(() => {
    if (toneId.current) getSoundManager().stop(toneId.current);
    setPlaying(true);
    toneId.current = getSoundManager().play('alert', { volume, onEnd: ended });
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = setTimeout(ended, TONE_MS + 1000);
  }, [volume, ended]);

  useEffect(
    () => () => {
      if (fallback.current) clearTimeout(fallback.current);
      if (toneId.current) getSoundManager().stop(toneId.current);
    },
    []
  );

  if (!mounted) {
    return (
      <div className="set-row set-slider" aria-hidden="true">
        <div className="set-slider__top">
          <span className="set-row__name">Alert volume</span>
        </div>
        <span className="set-row__loading" />
      </div>
    );
  }

  return (
    <div className="set-item">
      <SliderRow
        id="alert-volume"
        name="Alert volume"
        value={volume}
        min={0}
        max={100}
        valueText={(v) => `${v} of 100`}
        onChange={(v) => {
          tuneWatch({ alertVolume: v });
          changed();
        }}
      >
        <SavedNote note={note} />
        <TestKey label="Alert volume" playing={playing} onPlay={play} onStop={stop} />
      </SliderRow>
      <p className="set-line">Unanswered alerts get louder from here.</p>
    </div>
  );
}

export default AlertVolume;

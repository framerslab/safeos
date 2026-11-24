'use client';
/**
 * The watch's meters
 *
 * A meter for each kind the setting in use checks, in the strip along the
 * live picture's foot: its name, a word for its state, and a bar on an 8 px
 * track filled in the accent up to the alert line and in the alert colour
 * past it, with the line drawn across the track. While Lost and Found
 * compares, the pet's meter names what it compares and says where it sits
 * against the alert line. A change of state is not announced; under reduced motion a
 * meter's shown reading changes at most once a second.
 *
 * @module components/watch/Meters
 */

import { useEffect, useRef, useState } from 'react';
import { ProblemMark } from '../dashboard/Drawn';
import { SightingReading } from '../SubjectPreview';
import { checksInARow } from '../../lib/lost-found-words';
import { MICROPHONE_WORDS, type MicrophoneProblem } from '../../lib/camera-failure';
import { METER_STATE_WORDS, meterValueText, type MeterReading } from '../../lib/watch-meters';

export type MeterKind = 'motion' | 'sound' | 'picture-change';

export interface MeterRow {
  kind: MeterKind;
  reading: MeterReading;
}

export interface MetersProps {
  /** Only the kinds the setting in use checks. */
  rows: MeterRow[];
  /** The pet, while Lost and Found compares. */
  pet: { name: string; photo: string | null; score: number; alertLine: number; checks: number } | null;
  microphone: MicrophoneProblem | null;
}

export const METER_NAMES: Record<MeterKind, string> = {
  motion: 'Motion',
  sound: 'Sound',
  'picture-change': 'Picture change',
};

const REDUCE = '(prefers-reduced-motion: reduce)';

/** The reading shown: the newest, or under reduced motion the newest once a second. */
function useSteppedReading(reading: MeterReading): MeterReading {
  const [still, setStill] = useState(false);
  const [shown, setShown] = useState(reading);
  const newest = useRef(reading);
  newest.current = reading;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCE);
    const update = () => setStill(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (!still) return;
    setShown(newest.current);
    const interval = window.setInterval(() => setShown(newest.current), 1000);
    return () => window.clearInterval(interval);
  }, [still]);

  // A reading cleared (a new watch, another camera) empties the meter at
  // once; a held one is never the last camera's.
  if (reading.state === 'loading' && shown.state !== 'loading') setShown(reading);
  return still && reading.state !== 'loading' ? shown : reading;
}

function Meter({ kind, reading: newest }: MeterRow) {
  const reading = useSteppedReading(newest);
  const name = METER_NAMES[kind];
  const { value, line, state } = reading;
  const filled = line === null ? value : Math.min(value, line);
  const over = line !== null && value >= line ? value - line : 0;
  return (
    <div className="watch-meter" data-state={state}>
      <span className="watch-meter__name">{name}</span>
      {state !== 'loading' && <span className="watch-meter__state">{METER_STATE_WORDS[state]}</span>}
      <div
        className="watch-meter__track"
        role="meter"
        aria-label={`${name} level`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={meterValueText(reading)}
      >
        <span className="watch-meter__fill" style={{ width: `${filled}%` }} />
        {over > 0 && <span className="watch-meter__over" style={{ left: `${line}%`, width: `${over}%` }} />}
        {line !== null && <span className="watch-meter__line" style={{ left: `${line}%` }} />}
      </div>
    </div>
  );
}

function SoundProblem({ problem }: { problem: MicrophoneProblem }) {
  return (
    <div className="watch-meter watch-meter--problem">
      <span className="watch-meter__name">{METER_NAMES.sound}</span>
      <p className="watch-meter__problem">
        <ProblemMark />
        <span>{MICROPHONE_WORDS[problem]}</span>
      </p>
    </div>
  );
}

export function Meters({ rows, pet, microphone }: MetersProps) {
  return (
    <div className="watch-meters">
      {/* Says once when the microphone is lost or blocked, never a reading. */}
      <p role="status" aria-live="polite" className="sr-only">
        {microphone ? `${METER_NAMES.sound}: ${MICROPHONE_WORDS[microphone]}` : ''}
      </p>
      {rows.map((row) =>
        row.kind === 'sound' && microphone ? (
          <SoundProblem key={row.kind} problem={microphone} />
        ) : (
          <Meter key={row.kind} kind={row.kind} reading={row.reading} />
        ),
      )}
      {pet && (
        <div className="watch-meter watch-meter--pet" data-lost-found-card="picture">
          {pet.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="watch-meter__photo" src={pet.photo} alt="" width={24} height={24} />
          )}
          <span className="watch-meter__name" translate="no">{pet.name}</span>
          <span className="watch-meter__compares">
            Comparing with <span translate="no">{pet.name}</span>’s photos
          </span>
          <div className="col-span-2 min-w-0">
            <SightingReading score={pet.score} alertLine={pet.alertLine} />
            {pet.score > 0 && pet.checks > 0 && (
              <p className="mt-2 break-words text-sm">{checksInARow(pet.checks, pet.name)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

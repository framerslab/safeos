/**
 * The small pictures of the list's first three rows, each aria-hidden beside
 * its value line, which says the same in words; none looks like a control:
 * no knob, no handle, no hour marks.
 *
 * - ListMeters: Motion and Sound as two short meters stacked, each drawn
 *   empty with its alert tick while no watch runs.
 * - VolumeBar: a short bar filled to the alert volume.
 * - QuietBand: a 24-hour band with the quiet hours shaded and a moon inside them.
 *
 * @module components/settings/ListPictures
 */

import type { CSSProperties } from 'react';
import { alertLineOf } from '@/lib/settings-values';

const at = (fraction: number) => `${Math.max(0, Math.min(1, fraction)) * 100}%`;

function Meter({ value }: { value: number }) {
  return (
    <span className="set-pic-meter">
      <span className="set-pic-meter__tick" style={{ left: at(alertLineOf(value) / 100) }} />
    </span>
  );
}

export function ListMeters({ motion, sound, soundOn }: { motion: number; sound: number; soundOn: boolean }) {
  return (
    <span className="set-pic set-pic--meters" aria-hidden="true">
      <Meter value={motion} />
      {soundOn ? <Meter value={sound} /> : <span className="set-pic-meter" />}
    </span>
  );
}

export function VolumeBar({ volume }: { volume: number }) {
  return (
    <span className="set-pic set-pic--volume" aria-hidden="true">
      <span className="set-pic-volume__fill" style={{ width: at(volume / 100) }} />
    </span>
  );
}

function MoonGlyph({ style }: { style: CSSProperties }) {
  return (
    <svg className="set-pic-band__moon" style={style} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" />
    </svg>
  );
}

export function QuietBand({ band }: { band: Array<{ from: number; to: number }> }) {
  const widest = band.reduce<{ from: number; to: number } | null>(
    (best, part) => (!best || part.to - part.from > best.to - best.from ? part : best),
    null
  );
  return (
    <span className="set-pic set-pic--band" aria-hidden="true">
      {band.map((part) => (
        <span key={`${part.from}-${part.to}`} className="set-pic-band__quiet" style={{ left: at(part.from), width: at(part.to - part.from) }} />
      ))}
      {widest ? <MoonGlyph style={{ left: at((widest.from + widest.to) / 2) }} /> : null}
    </span>
  );
}

export function PetPhoto({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="set-pic-pet" src={src} alt="" width={32} height={32} />;
}

'use client';

/**
 * A slider row: the name at the left, the value at the right in tabular
 * figures, the slider across the row under them and the two ends' words
 * under it. The arrow keys move it one step, Page Up and Page Down ten, Home
 * and End to its ends, and a press on the track moves it there.
 *
 * @module components/settings/SliderRow
 */

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';

export interface SliderRowProps {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  ends?: [string, string];
  /** The value in words for a screen reader: "80 of 100". */
  valueText: (v: number) => string;
  /** The value as the row shows it; the number itself by default. */
  shown?: (v: number) => string;
  disabled?: boolean;
  onChange: (v: number) => void;
  /** Shown at the row's right beside the value: "Saved", a test key. */
  children?: ReactNode;
}

export function SliderRow({
  id,
  name,
  value,
  min,
  max,
  step = 1,
  ends,
  valueText,
  shown,
  disabled,
  onChange,
  children,
}: SliderRowProps) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const move = (next: number) => {
    const to = clamp(next);
    if (to !== value) onChange(to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    const page = step * 10;
    const moves: Record<string, () => number> = {
      ArrowLeft: () => value - step,
      ArrowDown: () => value - step,
      ArrowRight: () => value + step,
      ArrowUp: () => value + step,
      PageDown: () => value - page,
      PageUp: () => value + page,
      Home: () => min,
      End: () => max,
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    move(next());
  };

  const filled = max > min ? ((clamp(value) - min) / (max - min)) * 100 : 0;
  const fill = { '--set-fill': `${filled}%` } as CSSProperties;

  return (
    <div className={`set-row set-slider${disabled ? ' set-row--inactive' : ''}`}>
      <div className="set-slider__top">
        <label htmlFor={id} className="set-row__name">
          {name}
        </label>
        <span className="set-slider__value num" aria-hidden="true">
          {shown ? shown(value) : value}
        </span>
        {children ? <span className="set-slider__extra">{children}</span> : null}
      </div>
      <input
        id={id}
        type="range"
        className="set-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText(value)}
        onKeyDown={onKeyDown}
        onChange={(event) => move(Number(event.target.value))}
        style={fill}
      />
      {ends ? (
        <div className="set-slider__ends">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      ) : null}
    </div>
  );
}

export default SliderRow;

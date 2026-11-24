'use client';

/**
 * A field: its label above, what was typed kept, and its error under it with
 * the problem glyph.
 *
 * @module components/settings/FieldRow
 */

import { ProblemGlyph } from './glyphs';

export function FieldRow({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  type?: 'text' | 'email' | 'tel' | 'url';
  autoComplete?: string;
  disabled?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="set-field">
      <label htmlFor={id} className="set-row__name">
        {label}
      </label>
      <input
        id={id}
        className="set-field__input"
        type={type}
        value={value}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} className="set-field__error">
          <ProblemGlyph />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default FieldRow;

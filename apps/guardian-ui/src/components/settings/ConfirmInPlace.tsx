'use client';

/**
 * A question asked in place: the key that asks is replaced by its question
 * and two keys on one row. The question takes focus; Cancel, or the answer,
 * gives focus back to the key. No browser confirm box.
 *
 * @module components/settings/ConfirmInPlace
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyRow } from '@/components/KeyRow';

export function ConfirmInPlace({
  question,
  confirm,
  onConfirm,
  onCancel,
}: {
  question: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const questionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    questionRef.current?.focus();
  }, []);

  return (
    <div className="set-confirm">
      <p ref={questionRef} tabIndex={-1} className="set-confirm__question">
        {question}
      </p>
      <KeyRow className="set-confirm__keys">
        <button type="button" className="key key--outline set-key" onClick={onConfirm}>
          {confirm}
        </button>
        <button type="button" className="key key--outline set-key" onClick={onCancel}>
          Cancel
        </button>
      </KeyRow>
    </div>
  );
}

/**
 * An outlined key that asks its question in place before it acts.
 */
export function AskInPlace({
  label,
  question,
  confirm,
  onConfirm,
  glyph,
  disabled,
}: {
  label: string;
  question: string;
  confirm: string;
  onConfirm: () => void;
  glyph?: ReactNode;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const keyRef = useRef<HTMLButtonElement>(null);
  const giveBack = useRef(false);

  useEffect(() => {
    if (!asking && giveBack.current) {
      giveBack.current = false;
      keyRef.current?.focus();
    }
  }, [asking]);

  if (asking) {
    return (
      <ConfirmInPlace
        question={question}
        confirm={confirm}
        onConfirm={() => {
          giveBack.current = true;
          setAsking(false);
          onConfirm();
        }}
        onCancel={() => {
          giveBack.current = true;
          setAsking(false);
        }}
      />
    );
  }

  return (
    <button
      ref={keyRef}
      type="button"
      className="key key--outline set-key"
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) setAsking(true);
      }}
    >
      {glyph}
      {label}
    </button>
  );
}

export default ConfirmInPlace;

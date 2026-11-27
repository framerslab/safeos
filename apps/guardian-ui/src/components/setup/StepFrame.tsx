/**
 * The frame both setup steps share: Back and the step's glyph in one row,
 * the step itself, and on a phone the look row at the column's foot.
 *
 * @module components/setup/StepFrame
 */

'use client';

import { useEffect, useRef } from 'react';
import { LookRow } from '../app/LookRow';
import { BackArrow, ProgressGlyph } from './drawings';

export interface StepFrameProps {
  step: 1 | 2;
  entered: 'first' | 'change';
  /** Back's address before script and when a press leaves setup: the home page on step 1. */
  backHref: string;
  onBack: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
}

export function StepFrame({ step, entered, backHref, onBack, children }: StepFrameProps) {
  return (
    <main className="setup" data-step={step}>
      <div className="setup-screen">
        <div className="setup-back-row">
          <a href={backHref} className="setup-back" onClick={onBack}>
            <BackArrow />
            <span>Back</span>
          </a>
          <ProgressGlyph step={step} />
        </div>
        <div className="setup-step" data-entered={entered} key={step}>
          {children}
        </div>
      </div>
      <div className="setup-look">
        <LookRow rowClass="setup-look-row" />
      </div>
    </main>
  );
}

/** A step's one h1, focused when the step was entered by a change, with the glyph's copy that stands under it. */
export function StepHeading({ step, id, focus, children }: { step: 1 | 2; id: string; focus: boolean; children: React.ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focus) heading.current?.focus();
  }, [focus]);

  return (
    <>
      <h1 id={id} className="setup-heading" tabIndex={-1} ref={heading}>
        {children}
      </h1>
      <ProgressGlyph step={step} under />
    </>
  );
}

export default StepFrame;

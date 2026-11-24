/**
 * The notice before the first watch: "Each alert keeps a picture".
 *
 * A device that has not answered it gets it before any watch starts,
 * whichever key starts the watch. It shows the same switch, select and
 * lines as the group "Alert pictures": Start watching keeps the choice and
 * starts the watch, Go back closes it and leaves the watch not started. No
 * picture is kept before it is answered. Setup's camera step shows the same
 * title, choice and lines (`SetupPicturesChoice`); a device that went on
 * past that step has answered, and its first watch starts with no notice.
 *
 * @module components/alert-pictures/PicturesNotice
 */

'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { postPictureNews, settingsNews } from '../../lib/alert-pictures/channel';
import { noticeAnswered } from '../../lib/alert-pictures/keeper';
import { ASK_LINE, GO_BACK, KEEPS_LINE, KEEP_OFF_LINE, NOTICE_TITLE, START_WATCHING, STAY_LINE } from '../../lib/alert-pictures/words';
import { useAlertPicturesStore, type DeleteAfterDays } from '../../stores/alert-pictures-store';
import { DeleteAfterRow, KeepSwitchRow, StreetLine } from './AlertPicturesGroup';
import { PicturesDrawing } from './Glyphs';
import { KeyRow } from './KeyRow';

const TITLE_ID = 'alert-pictures-notice-title';
const STOPS = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface PicturesNoticeProps {
  /** Start watching: the choice as set in the notice. */
  onStart: (choice: { keep: boolean; deleteAfterDays: DeleteAfterDays }) => void;
  /** Go back, or Escape: the watch is not started. */
  onBack: () => void;
}

/** What an alert keeps, as the person sets it: the switch and the select as set. */
export interface PicturesChoiceProps {
  keep: boolean;
  days: DeleteAfterDays;
  onKeep: (keep: boolean) => void;
  onDays: (days: DeleteAfterDays) => void;
}

/** The notice's drawing, its switch and select, and its four lines with the regulator's guidance. */
export function PicturesChoice({ keep, days, onKeep, onDays }: PicturesChoiceProps) {
  return (
    <>
      <PicturesDrawing />
      <div className="alert-pictures-notice__choices">
        <KeepSwitchRow keep={keep} onChange={onKeep} />
        {!keep && <p className="alert-pictures-quiet">{KEEP_OFF_LINE}</p>}
        <DeleteAfterRow days={days} onChange={onDays} />
      </div>
      <p className="alert-pictures-line" data-lead="">{KEEPS_LINE}</p>
      <p className="alert-pictures-line" data-lead="">{STAY_LINE}</p>
      <p className="alert-pictures-line" data-lead="">{ASK_LINE}</p>
      <StreetLine />
    </>
  );
}

/**
 * Setup's camera step: the notice's title, choice and lines in a group of
 * their own. Setup keeps the choice and answers the notice with it when the
 * person goes on past the step.
 */
export function SetupPicturesChoice(props: PicturesChoiceProps) {
  const title = useId();
  return (
    <div role="group" aria-labelledby={title} className="alert-pictures-setup">
      <h3 id={title} className="alert-pictures-setup__title" data-lead="">{NOTICE_TITLE}</h3>
      <PicturesChoice {...props} />
    </div>
  );
}

export function PicturesNotice({ onStart, onBack }: PicturesNoticeProps) {
  const [keep, setKeep] = useState(() => useAlertPicturesStore.getState().keep);
  const [days, setDays] = useState<DeleteAfterDays>(() => useAlertPicturesStore.getState().deleteAfterDays);
  const panel = useRef<HTMLDivElement>(null);

  // Focus starts on the notice's panel, so a screen reader reads its title first.
  useEffect(() => { panel.current?.focus(); }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onBack();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    // The notice holds focus: past its last stop comes its first.
    const stops = Array.from(panel.current.querySelectorAll<HTMLElement>(STOPS));
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const at = document.activeElement;
    if (event.shiftKey && (at === first || at === panel.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && at === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="alert-pictures-overlay">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        className="alert-pictures-notice"
        onKeyDown={onKeyDown}
      >
        <div className="alert-pictures-notice__body">
          <h2 id={TITLE_ID} className="alert-pictures-notice__title" data-lead="">{NOTICE_TITLE}</h2>
          <PicturesChoice keep={keep} days={days} onKeep={setKeep} onDays={setDays} />
        </div>
        <KeyRow className="alert-pictures-notice__foot">
          <button type="button" className="alert-pictures-key" onClick={onBack}>{GO_BACK}</button>
          <button type="button" className="alert-pictures-key alert-pictures-key--solid" onClick={() => onStart({ keep, deleteAfterDays: days })}>
            {START_WATCHING}
          </button>
        </KeyRow>
      </div>
    </div>,
    document.body,
  );
}

interface Pending {
  start: () => void;
  onBack?: () => void;
  /** What had focus when the notice opened: Go back gives it back. */
  opener: Element | null;
}

/**
 * The gate every start of a watch goes through: on a device that has
 * answered the notice the watch starts at once; on one that has not, the
 * notice opens first.
 */
export function useNoticeGate(): {
  askBeforeStart: (start: () => void, onBack?: () => void) => void;
  notice: React.ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);

  const askBeforeStart = useCallback((start: () => void, onBack?: () => void) => {
    if (noticeAnswered()) {
      start();
      return;
    }
    setPending({ start, onBack, opener: typeof document === 'undefined' ? null : document.activeElement });
  }, []);

  const close = (then?: () => void) => {
    const opener = pending?.opener;
    setPending(null);
    then?.();
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  };

  const notice = pending ? (
    <PicturesNotice
      onStart={(choice) => {
        // The answer holds in memory where the browser cannot keep it, until the page is reloaded.
        useAlertPicturesStore.getState().answerNotice(choice);
        postPictureNews(settingsNews(useAlertPicturesStore.getState()));
        close(pending.start);
      }}
      onBack={() => close(pending.onBack)}
    />
  ) : null;

  return { askBeforeStart, notice };
}

export default PicturesNotice;

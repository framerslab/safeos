/**
 * The group "Alert pictures": the switch Keep alert pictures, how long a
 * picture is kept, the count of pictures on this device and Delete all
 * pictures, with the lines that say what an alert keeps, where it stays and
 * what to ask of the people nearby. It stands in the watch's settings and on
 * Settings, Detection; the notice before the first watch shows the same
 * switch, select and lines.
 *
 * @module components/alert-pictures/AlertPicturesGroup
 */

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { MAX_MONITORING_ALERTS } from '../../lib/client-db';
import { DELETE_AFTER_CHOICES } from '../../lib/alert-pictures/rules';
import { checkPictureStore, deleteAllPictures, sweepPicturesByAge, useKeptCount, useListLine } from '../../lib/alert-pictures/keeper';
import { postPictureNews } from '../../lib/alert-pictures/channel';
import {
  ASK_LINE,
  DELETE_AFTER,
  DELETE_AFTER_LINE,
  DELETE_ALL,
  DELETE_FAILED,
  GROUP_NAME,
  ICO_LINK,
  ICO_OFFLINE,
  ICO_URL,
  KEEPS_LINE,
  KEEP_OFF_LINE,
  KEEP_SWITCH,
  KEEP_THEM,
  OUT_OF_ROOM_LINE,
  PRIVATE_WINDOW_LINE,
  STAY_LINE,
  STREET_LINE,
  WINDOW_LINE,
  afterWords,
  deleteAllQuestion,
  keptWords,
  limitLine,
} from '../../lib/alert-pictures/words';
import { useAlertPicturesStore, type DeleteAfterDays } from '../../stores/alert-pictures-store';
import { PicturesDrawing, ProblemGlyph } from './Glyphs';
import { KeyRow } from './KeyRow';

/** The id of the switch, which the card's link "Keep alert pictures" opens the group at. */
export const KEEP_SWITCH_ID = 'keep-alert-pictures';
/** The link's address and the event it raises, so a second press opens the group again. */
export const KEEP_SWITCH_HASH = `#${KEEP_SWITCH_ID}`;
export const OPEN_GROUP_EVENT = 'safeos-open-alert-pictures';

const selectValue = (days: DeleteAfterDays): string => (days === null ? 'none' : String(days));
const daysOf = (value: string): DeleteAfterDays =>
  value === 'none' ? null : (DELETE_AFTER_CHOICES.find((choice) => String(choice) === value) ?? 3);

/** True while the browser says it has no connection. */
function useOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const read = () => setOffline(navigator.onLine === false);
    read();
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    return () => {
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
    };
  }, []);
  return offline;
}

/** The switch Keep alert pictures on its row. */
export function KeepSwitchRow({ id, keep, onChange }: { id?: string; keep: boolean; onChange: (keep: boolean) => void }) {
  const label = useId();
  return (
    <div className="alert-pictures-row">
      <span id={label} className="alert-pictures-row__label">{KEEP_SWITCH}</span>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={keep}
        aria-labelledby={label}
        className="alert-pictures-switch"
        onClick={() => onChange(!keep)}
      >
        <span className="alert-pictures-switch__track" aria-hidden="true">
          <span className="alert-pictures-switch__knob" />
        </span>
      </button>
    </div>
  );
}

/** The select "Delete pictures after" on its row. */
export function DeleteAfterRow({ days, onChange }: { days: DeleteAfterDays; onChange: (days: DeleteAfterDays) => void }) {
  const id = useId();
  return (
    <div className="alert-pictures-row">
      <label htmlFor={id} className="alert-pictures-row__label">{DELETE_AFTER}</label>
      <select
        id={id}
        className="alert-pictures-select"
        value={selectValue(days)}
        onChange={(event) => onChange(daysOf(event.target.value))}
      >
        {DELETE_AFTER_CHOICES.map((choice) => (
          <option key={selectValue(choice)} value={selectValue(choice)}>{afterWords(choice)}</option>
        ))}
      </select>
    </div>
  );
}

/** The street line with the regulator's guidance on its own row; offline, the row says what the link opens. */
export function StreetLine() {
  const offline = useOffline();
  return (
    <>
      <p className="alert-pictures-line" data-lead="">{STREET_LINE}</p>
      <p className="alert-pictures-link-row">
        <a className="alert-pictures-link" href={ICO_URL} target="_blank" rel="noopener noreferrer">{ICO_LINK}</a>
        {offline && <span className="alert-pictures-quiet">{ICO_OFFLINE}</span>}
      </p>
    </>
  );
}

/** The question before Delete all pictures: an alert dialog named by its question, focus on Keep them. */
function DeleteQuestion({ count, onDelete, onKeep }: { count: number; onDelete: () => void; onKeep: () => void }) {
  const question = useId();
  const keepRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { keepRef.current?.focus(); }, []);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onKeep();
    } else if (event.key === 'Tab') {
      // Two keys: focus moves between them and stays in the question.
      event.preventDefault();
      (document.activeElement === keepRef.current ? deleteRef : keepRef).current?.focus();
    }
  };
  // Over the whole page, outside any section that clips or fades its content.
  return createPortal(
    <div className="alert-pictures-overlay">
      <div role="alertdialog" aria-modal="true" aria-labelledby={question} className="alert-pictures-question" onKeyDown={onKeyDown}>
        <p id={question} className="alert-pictures-line" data-lead="">{deleteAllQuestion(count)}</p>
        <KeyRow className="alert-pictures-question__keys">
          <button ref={deleteRef} type="button" className="alert-pictures-key" onClick={onDelete}>{DELETE_ALL}</button>
          <button ref={keepRef} type="button" className="alert-pictures-key" onClick={onKeep}>{KEEP_THEM}</button>
        </KeyRow>
      </div>
    </div>,
    document.body,
  );
}

interface AlertPicturesGroupProps {
  /** In the watch's settings, or on Settings, Detection. */
  place: 'watch' | 'settings';
}

export function AlertPicturesGroup({ place }: AlertPicturesGroupProps) {
  const heading = useId();
  const keep = useAlertPicturesStore((state) => state.keep);
  const days = useAlertPicturesStore((state) => state.deleteAfterDays);
  const setKeep = useAlertPicturesStore((state) => state.setKeep);
  const setDays = useAlertPicturesStore((state) => state.setDeleteAfterDays);
  const count = useKeptCount();
  const line = useListLine();
  const [asking, setAsking] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const deleteKey = useRef<HTMLButtonElement>(null);

  // The settings as this browser holds them, read after the first paint so the page's HTML and the device agree.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    void checkPictureStore();
  }, []);

  const changeKeep = (next: boolean) => {
    setKeep(next);
    postPictureNews({ type: 'settings' });
  };
  const changeDays = (next: DeleteAfterDays) => {
    setDays(next);
    postPictureNews({ type: 'settings' });
    // A shorter age applies now, not at the next watch.
    void sweepPicturesByAge();
  };
  const closeQuestion = () => {
    setAsking(false);
    // Focus goes back to the key that asked, where it stands.
    requestAnimationFrame(() => deleteKey.current?.focus());
  };
  const deleteAll = async () => {
    setAsking(false);
    const answer = await deleteAllPictures();
    setDeleteFailed(answer === 'failed');
    requestAnimationFrame(() => deleteKey.current?.focus());
  };

  const shownKeep = ready ? keep : true;
  const shownDays = ready ? days : 3;

  return (
    <div role="group" aria-labelledby={heading} className="alert-pictures-group" data-place={place}>
      <h3 id={heading} className={place === 'watch' ? 'alert-pictures-group__heading alert-pictures-hidden' : 'alert-pictures-group__heading'} data-lead="">
        {GROUP_NAME}
      </h3>

      <div className="alert-pictures-group__first">
        <PicturesDrawing />
        <p className="alert-pictures-line" data-lead="">{KEEPS_LINE}</p>
      </div>

      <div className="alert-pictures-group__controls">
        <div className="alert-pictures-group__choices">
          <div className="alert-pictures-group__choice">
            <KeepSwitchRow id={KEEP_SWITCH_ID} keep={shownKeep} onChange={changeKeep} />
            {!shownKeep && <p className="alert-pictures-quiet">{KEEP_OFF_LINE}</p>}
            {line === 'window' && <p className="alert-pictures-quiet">{WINDOW_LINE}</p>}
            {line === 'out-of-room' && (
              <p className="alert-pictures-quiet alert-pictures-problem">
                <ProblemGlyph />
                <span>{OUT_OF_ROOM_LINE}</span>
              </p>
            )}
          </div>
          <div className="alert-pictures-group__choice">
            <DeleteAfterRow days={shownDays} onChange={changeDays} />
            <p className="alert-pictures-quiet">{DELETE_AFTER_LINE}</p>
          </div>
        </div>

        <div className="alert-pictures-group__count">
          <div role="status" aria-live="polite">
            {count === null ? (
              <span className="alert-pictures-group__count-wait" aria-hidden="true" />
            ) : (
              <p className="alert-pictures-line alert-pictures-line--strong" data-lead="">{keptWords(count)}</p>
            )}
          </div>
          <p className="alert-pictures-quiet">{limitLine(MAX_MONITORING_ALERTS)}</p>
          {deleteFailed && (
            <p className="alert-pictures-quiet alert-pictures-problem" role="alert">
              <ProblemGlyph />
              <span>{DELETE_FAILED}</span>
            </p>
          )}
          {count !== null && count > 0 && (
            <button ref={deleteKey} type="button" className="alert-pictures-key alert-pictures-key--wide" onClick={() => setAsking(true)}>
              {DELETE_ALL}
            </button>
          )}
        </div>
      </div>

      <div className="alert-pictures-group__lines">
        <p className="alert-pictures-line" data-lead="">{STAY_LINE}</p>
        <p className="alert-pictures-line" data-lead="">{ASK_LINE}</p>
        <StreetLine />
        <p className="alert-pictures-line" data-lead="">{PRIVATE_WINDOW_LINE}</p>
      </div>

      {asking && count !== null && <DeleteQuestion count={count} onDelete={() => void deleteAll()} onKeep={closeQuestion} />}
    </div>
  );
}

export default AlertPicturesGroup;

/**
 * The picture, opened: an alert's picture large over the watch or History.
 *
 * The picture of the moment with its box, the close-up at its own size, a
 * switch that hides the box, Save picture and Delete picture. A dark
 * picture gains a switch that brightens the view alone. The watch keeps
 * running under the panel, and a new alert does not close it.
 *
 * The panel reads the picture through the keeper, so a picture deleted
 * here, in another tab or at its age leaves the panel at once: the line
 * that says why stands in its place, with Close. Save picture hands the
 * browser a file through its own download of a Blob; nothing here shares,
 * links or uploads a picture.
 *
 * @module components/alert-pictures/PictureDialog
 */

'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { useMonitoringStore, type Alert } from '../../stores/monitoring-store';
import { PictureUnreadable, brightenedUrl, savedFile } from '../../lib/alert-pictures/capture';
import { deletePicture, usePicture, usePictureStoreState } from '../../lib/alert-pictures/keeper';
import { closePicture, dropOpenedPicture, openedNow, subscribeOpened } from '../../lib/alert-pictures/opened';
import { kindOfAlert, pictureFileName, type AlertKind } from '../../lib/alert-pictures/rules';
import {
  BRIGHTEN,
  BRIGHTENED_VIEW,
  CLOSE,
  CLOSE_UP,
  DARK_LINE,
  DELETED_BY_PERSON,
  DELETE_PICTURE,
  DELETE_PICTURE_QUESTION,
  KEEP_IT,
  LOADING_PICTURE,
  NOT_KEPT_LINE,
  NO_PICTURE,
  PICTURE_CHANGE_LINE,
  PICTURE_DELETE_FAILED,
  SAVE_FAILED,
  SAVE_PICTURE,
  SHOW_THE_BOX,
  SOUND_LINE,
  UNREADABLE_DELETE,
  closeUpName,
  dateAtTime,
  deletedAfter,
  isSameDay,
  openedTitle,
  savedPhotoName,
  sightingQuestion,
  timeWords,
} from '../../lib/alert-pictures/words';
import { petNameOf, usePetPhoto } from '../../lib/alert-pictures/pet-photo';
import { EmptyFrameGlyph, ProblemGlyph } from './Glyphs';
import { KeyRow } from './KeyRow';
import { Moment, alertMoment } from './PictureBlock';

export { openPicture } from '../../lib/alert-pictures/opened';

/** Mounted once on a page whose alerts can open their pictures. */
export function PictureDialogHost() {
  const now = useSyncExternalStore(subscribeOpened, openedNow, () => null);
  // The alert as the watch holds it now: a repeat puts its newest picture and time on its card, and here.
  const live = useMonitoringStore((state) => (now ? state.alerts.find((alert) => alert.id === now.alert.id) : undefined));
  // A page that leaves takes its open picture with it.
  useEffect(() => dropOpenedPicture, []);
  if (!now) return null;
  return <PictureDialog key={now.alert.id} alert={live ?? now.alert} onClose={closePicture} />;
}

// =============================================================================
// The panel
// =============================================================================

const STOPS = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function SwitchRow({ label, on, inactive, onChange }: { label: string; on: boolean; inactive?: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="alert-pictures-row">
      <span id={id} className="alert-pictures-row__label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={id}
        aria-disabled={inactive ? true : undefined}
        className="alert-pictures-switch"
        onClick={() => { if (!inactive) onChange(!on); }}
      >
        <span className="alert-pictures-switch__track" aria-hidden="true">
          <span className="alert-pictures-switch__knob" />
        </span>
      </button>
    </div>
  );
}

/** The question before Delete picture: an alert dialog named by its question, focus on Keep it. */
function DeleteQuestion({ onDelete, onKeep }: { onDelete: () => void; onKeep: () => void }) {
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
  return createPortal(
    <div className="alert-pictures-overlay alert-picture-dialog__over">
      <div role="alertdialog" aria-modal="true" aria-labelledby={question} className="alert-pictures-question" onKeyDown={onKeyDown}>
        <p id={question} className="alert-pictures-line" data-lead="">{DELETE_PICTURE_QUESTION}</p>
        <KeyRow className="alert-pictures-question__keys">
          <button ref={deleteRef} type="button" className="alert-pictures-key" onClick={onDelete}>{DELETE_PICTURE}</button>
          <button ref={keepRef} type="button" className="alert-pictures-key" onClick={onKeep}>{KEEP_IT}</button>
        </KeyRow>
      </div>
    </div>,
    document.body,
  );
}

function PictureDialog({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const kind: AlertKind = kindOfAlert(alert) ?? 'motion';
  const at = alertMoment(alert);
  const view = usePicture(alert.pictureId);
  const store = usePictureStoreState();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const [showBox, setShowBox] = useState(true);
  const [brighten, setBrighten] = useState(false);
  // The brightened view's copies, named for the picture they were made of.
  const [bright, setBright] = useState<{ id: string; frame: string; closeUp: string | null } | null>(null);
  // The delete question is asked of one picture: the one shown when Delete picture was pressed.
  const [asking, setAsking] = useState<string | null>(null);
  // The picture whose delete failed. The line belongs to that picture, so a repeat that puts a
  // newer picture in the panel takes it away.
  const [deleteFailedId, setDeleteFailedId] = useState<string | null>(null);
  // The picture the panel shows now, read after a delete's answer: a repeat can change it meanwhile.
  const shownId = useRef(alert.pictureId);
  useEffect(() => {
    shownId.current = alert.pictureId;
  }, [alert.pictureId]);
  // The picture Save picture could not read. A read failure belongs to the picture it was read
  // for, even when it comes back after a repeat put a newer picture in the panel.
  const [unreadId, setUnreadId] = useState<string | null>(null);
  const busy = useRef(false);
  // Save picture's file while it is made: a delete confirmed meanwhile waits for it.
  const saving = useRef<Promise<void> | null>(null);

  const set = view.status === 'shown' && view.kept !== 'saving' ? view.set : null;
  const loading = view.status === 'loading' || (view.status === 'shown' && view.kept === 'saving');
  // A picture that cannot be read when the panel opens, or when Save picture is pressed.
  const unreadable = view.status === 'unreadable' || (set !== null && set.id === unreadId);
  const shown = set !== null && !unreadable;
  const gone = !loading && !shown && !unreadable;

  // Focus starts on Close, and comes back to it when the picture leaves while the panel is open.
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    if (gone) closeRef.current?.focus();
  }, [gone]);
  // A control that leaves the panel takes focus with it (Brighten, when a repeat brings a picture
  // that is not dark): focus goes to Close, so it stays in the panel.
  useEffect(() => {
    if (asking !== null) return;
    const here = document.activeElement;
    if (!here || here === document.body) closeRef.current?.focus();
  });

  // The brightened view: canvas copies of a dark picture for the view alone, let go when the switch
  // turns off or the picture changes.
  useEffect(() => {
    if (!brighten || !set || !set.dark) return;
    let alive = true;
    let made: { frame: string; closeUp: string | null } | null = null;
    const letGo = (urls: { frame: string; closeUp: string | null }) => {
      URL.revokeObjectURL(urls.frame);
      if (urls.closeUp) URL.revokeObjectURL(urls.closeUp);
    };
    brightenedUrl(set).then(
      (urls) => {
        if (!alive) return letGo(urls);
        made = urls;
        setBright({ id: set.id, ...urls });
      },
      () => { if (alive) setBrighten(false); },
    );
    return () => {
      alive = false;
      if (made) letGo(made);
      setBright(null);
    };
  }, [brighten, set]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    // The panel holds focus: past its last stop comes its first.
    const stops = Array.from(panel.current.querySelectorAll<HTMLElement>(STOPS));
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const here = document.activeElement;
    if (event.shiftKey && (here === first || here === panel.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && here === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const save = () => {
    const target = set;
    if (!target || busy.current) return;
    busy.current = true;
    saving.current = (async () => {
      try {
        // As it shows: with the box drawn in while Show the box is on, clean while it is off; never brightened.
        const file = await savedFile(target, showBox && Boolean(target.box));
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = pictureFileName(kind, new Date(target.takenAt));
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (error) {
        // A picture that cannot be read says so; a file that could not be made leaves the picture
        // shown, and Save picture can be pressed again.
        if (error instanceof PictureUnreadable) setUnreadId(target.id);
      } finally {
        busy.current = false;
        saving.current = null;
      }
    })();
  };

  const remove = async () => {
    const target = asking;
    setAsking(null);
    if (!target || target !== alert.pictureId) return;
    // Save picture may be making its file: the delete goes ahead once the file is made.
    const making = saving.current;
    if (making) await making;
    if (busy.current) return;
    busy.current = true;
    const answer = await deletePicture(target, { kind, takenAt: at });
    busy.current = false;
    if (answer === 'failed') {
      setDeleteFailedId(target);
      deleteRef.current?.focus();
      return;
    }
    // A repeat put a newer picture in the panel while the earlier one was deleted: the newer one stays open.
    if (shownId.current !== target) {
      deleteRef.current?.focus();
      return;
    }
    onClose();
  };

  const keep = () => {
    setAsking(null);
    deleteRef.current?.focus();
  };

  // A repeat that gives the panel a newer picture closes a question asked of the earlier one.
  useEffect(() => {
    if (asking !== null && asking !== alert.pictureId) {
      setAsking(null);
      deleteRef.current?.focus();
    }
  }, [asking, alert.pictureId]);

  const boxed = shown && Boolean(set?.box);
  // A brightened view shows only with the dark picture it was made of.
  const brightened = bright !== null && set !== null && set.dark && bright.id === set.id ? bright : null;
  const goneLine = view.status === 'gone-person' ? DELETED_BY_PERSON
    : view.status === 'gone-age' ? deletedAfter(view.days)
      : NO_PICTURE;
  const status = loading ? 'loading' : shown ? 'shown' : unreadable ? 'unreadable' : 'gone';

  return (
    <>
      {createPortal(
        <div
          className="alert-pictures-overlay"
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="alert-picture-dialog"
            data-status={status}
            onKeyDown={onKeyDown}
          >
            <div className="alert-picture-dialog__head">
              {kind === 'sighting' ? (
                // A sighting is titled by its question, with its time under it.
                <div className="alert-picture-dialog__titles">
                  <h2 id={titleId} className="alert-picture-dialog__title" data-lead="">{sightingQuestion(petNameOf(alert))}</h2>
                  <p className="alert-picture-dialog__time">{isSameDay(at) ? timeWords(at) : dateAtTime(at)}</p>
                </div>
              ) : (
                <h2 id={titleId} className="alert-picture-dialog__title" data-lead="">{openedTitle(kind, at)}</h2>
              )}
              <button ref={closeRef} type="button" className="alert-pictures-key" onClick={onClose}>{CLOSE}</button>
            </div>

            {(loading || (shown && view.status === 'shown' && (view.kept === 'failed' || (view.kept === 'memory' && store === 'usable')))) && (
              <div className="alert-picture-dialog__under">
                {loading && <p className="alert-picture__quiet">{LOADING_PICTURE}</p>}
                {shown && view.status === 'shown' && view.kept === 'failed' && (
                  <p className="alert-picture__quiet alert-picture__why">
                    <ProblemGlyph />
                    <span>{SAVE_FAILED}</span>
                  </p>
                )}
                {shown && view.status === 'shown' && view.kept === 'memory' && store === 'usable' && (
                  <p className="alert-picture__quiet">{NOT_KEPT_LINE}</p>
                )}
              </div>
            )}

            <div className="alert-picture-dialog__picture">
              {loading && <div className="alert-picture-dialog__wait" aria-hidden="true" />}
              {shown && set && view.status === 'shown' && (
                <>
                  <Moment
                    set={set}
                    url={brightened?.frame ?? view.frameUrl}
                    at={at}
                    boxed={boxed && showBox}
                    className="alert-picture__frame"
                  />
                  {brightened && <p className="alert-picture-dialog__plate">{BRIGHTENED_VIEW}</p>}
                </>
              )}
              {unreadable && (
                <p className="alert-picture__quiet alert-picture__why">
                  <ProblemGlyph />
                  <span>{UNREADABLE_DELETE}</span>
                </p>
              )}
              {gone && (
                <p className="alert-picture__quiet alert-picture__why">
                  <EmptyFrameGlyph />
                  <span>{goneLine}</span>
                </p>
              )}
            </div>

            {!gone && (
              <div className="alert-picture-dialog__side">
                {shown && set && view.status === 'shown' && (
                  <>
                    {kind === 'sound' && <p className="alert-picture__quiet">{SOUND_LINE}</p>}
                    {kind === 'picture-change' && <p className="alert-picture__quiet">{PICTURE_CHANGE_LINE}</p>}
                    {set.dark && <p className="alert-picture__quiet">{DARK_LINE}</p>}
                    {view.closeUpUrl && (
                      <div className="alert-picture-dialog__close">
                        <p className="alert-picture__quiet">{CLOSE_UP}</p>
                        <img
                          className="alert-picture-dialog__close-up"
                          src={brightened?.closeUp ?? view.closeUpUrl}
                          alt={closeUpName(at)}
                          width={set.closeUpWidth || undefined}
                          height={set.closeUpHeight || undefined}
                          draggable={false}
                        />
                      </div>
                    )}
                    {kind === 'sighting' && <PetPhoto alert={alert} />}
                  </>
                )}
                {((shown && boxed) || (loading && kind !== 'sound')) && (
                  <SwitchRow label={SHOW_THE_BOX} on={showBox} inactive={loading} onChange={setShowBox} />
                )}
                {shown && set?.dark && <SwitchRow label={BRIGHTEN} on={brighten} onChange={setBrighten} />}
                {deleteFailedId !== null && deleteFailedId === alert.pictureId && (
                  <p className="alert-picture__quiet alert-picture__why" role="alert">
                    <ProblemGlyph />
                    <span>{PICTURE_DELETE_FAILED}</span>
                  </p>
                )}
                <div className="alert-picture-dialog__keys">
                  {!unreadable && (
                    <button
                      type="button"
                      className="alert-pictures-key"
                      aria-disabled={loading ? true : undefined}
                      onClick={() => { if (!loading) save(); }}
                    >
                      {SAVE_PICTURE}
                    </button>
                  )}
                  <button
                    ref={deleteRef}
                    type="button"
                    className="alert-pictures-key"
                    aria-disabled={loading ? true : undefined}
                    onClick={() => { if (!loading && alert.pictureId) setAsking(alert.pictureId); }}
                  >
                    {DELETE_PICTURE}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
      {asking !== null && !gone && <DeleteQuestion onDelete={() => void remove()} onKeep={keep} />}
    </>
  );
}

/** A sighting's pet, as its owner saved it: the photo under its label, after the close-up. */
function PetPhoto({ alert }: { alert: Alert }) {
  const photo = usePetPhoto(alert.subjectId);
  if (!photo) return null;
  const name = savedPhotoName(petNameOf(alert));
  return (
    <div className="alert-picture-dialog__close alert-picture-dialog__pet">
      <p className="alert-picture__quiet">{name}</p>
      <img className="alert-picture-dialog__close-up" src={photo} alt={name} draggable={false} />
    </div>
  );
}

export default PictureDialogHost;

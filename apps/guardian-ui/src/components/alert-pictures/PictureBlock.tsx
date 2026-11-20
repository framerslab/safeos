/**
 * An alert card's picture block: the camera's picture of the moment with
 * one box round what set the alert off, the close-up of that box, and the
 * kind and time in words.
 *
 * The large form is the newest card's: the picture across the card, with
 * the close-up beside its words (a phone), in the block's right half (a
 * tablet) or beside the picture at the same height (a desktop). The small
 * form is every other card's: one thumbnail, the close-up where there is
 * one, beside the kind and time. An alert with no picture shows its words
 * with the glyph of an empty frame and one line that says why.
 *
 * @module components/alert-pictures/PictureBlock
 */

'use client';

import type { CSSProperties } from 'react';

import type { Alert } from '../../stores/monitoring-store';
import { cardTime } from '../../lib/alert-event';
import { kindOfAlert, type AlertKind, type Box } from '../../lib/alert-pictures/rules';
import { usePicture, usePictureStoreState, type PictureView } from '../../lib/alert-pictures/keeper';
import type { PictureSet } from '../../lib/alert-pictures/capture';
import {
  CLOSE_UP,
  DARK_LINE,
  DELETED_BY_PERSON,
  KEEP_SWITCH,
  NOT_KEPT_LINE,
  NO_PICTURE,
  OPEN_PICTURE,
  PICTURE_CHANGE_LINE,
  SAVE_FAILED,
  SOUND_LINE,
  UNREADABLE,
  closeUpName,
  deletedAfter,
  inZone,
  kindAtTime,
  openPictureName,
  pictureName,
} from '../../lib/alert-pictures/words';
import { KEEP_SWITCH_HASH, OPEN_GROUP_EVENT } from './AlertPicturesGroup';
import { EmptyFrameGlyph, ProblemGlyph } from './Glyphs';
import { PICTURE_BLOCK_MARK, openPicture } from '../../lib/alert-pictures/opened';

/** The mark on an alert's Open picture key. */
const OPEN_KEY_MARK = 'data-open-picture';

interface PictureBlockProps {
  alert: Alert;
  form: 'large' | 'small';
}

/** The time a card's words say: its newest alert's. */
export function alertMoment(alert: Alert): number {
  const at = Date.parse(cardTime(alert) ?? '');
  return Number.isFinite(at) ? at : Date.now();
}

/** A frame taller than 4:3 stands whole inside a 4:3 tile. */
const isTall = (set: PictureSet) => set.frameWidth * 3 < set.frameHeight * 4;

const percent = (part: number, whole: number) => `${(part / whole) * 100}%`;

function boxStyle(box: Box, set: PictureSet): CSSProperties {
  return {
    left: percent(box.x, set.frameWidth),
    top: percent(box.y, set.frameHeight),
    width: percent(box.width, set.frameWidth),
    height: percent(box.height, set.frameHeight),
  };
}

interface MomentProps {
  set: PictureSet;
  url: string;
  at: number;
  className: string;
  /** Whether the box shows; where it is hidden the picture's name says nothing of a box. */
  boxed?: boolean;
  /** A pointer press on the picture: the same action as Open picture. */
  onPress?: () => void;
}

/** The picture of the moment at its own shape, with its box drawn over it. */
export function Moment({ set, url, at, className, boxed = Boolean(set.box), onPress }: MomentProps) {
  const box = boxed ? set.box : null;
  return (
    <div className={className} data-tall={isTall(set) ? '' : undefined} data-press={onPress ? '' : undefined} onClick={onPress}>
      <div className="alert-picture__fit" style={{ aspectRatio: `${set.frameWidth} / ${set.frameHeight}` }}>
        <img
          className="alert-picture__image"
          src={url}
          alt={pictureName(Boolean(box), at)}
          width={set.frameWidth}
          height={set.frameHeight}
          draggable={false}
        />
        {box && <span className="alert-picture__box" style={boxStyle(box, set)} aria-hidden="true" />}
      </div>
    </div>
  );
}

function CloseUp({ set, url, at, onPress }: { set: PictureSet; url: string; at: number; onPress?: () => void }) {
  return (
    <div className="alert-picture__tile" data-press={onPress ? '' : undefined} onClick={onPress}>
      <img
        className="alert-picture__image"
        src={url}
        alt={closeUpName(at)}
        width={set.closeUpWidth || undefined}
        height={set.closeUpHeight || undefined}
        draggable={false}
      />
    </div>
  );
}

/** The line that says why an alert has no picture, or null while it has one or one is on its way. */
function emptyLine(view: PictureView): { line: string; problem: boolean } | null {
  switch (view.status) {
    case 'none': return { line: NO_PICTURE, problem: false };
    case 'gone-person': return { line: DELETED_BY_PERSON, problem: false };
    case 'gone-age': return { line: deletedAfter(view.days), problem: false };
    case 'unreadable': return { line: UNREADABLE, problem: true };
    default: return null;
  }
}

function Words({ kind, at, zone, children }: { kind: AlertKind; at: number; zone?: string; children?: React.ReactNode }) {
  return (
    <div className="alert-picture__words">
      <p className="alert-picture__lead" data-lead="">{kindAtTime(kind, at)}</p>
      {zone && <p className="alert-picture__quiet alert-picture__zone">{inZone(zone)}</p>}
      {children}
    </div>
  );
}

/** The Open picture key of an alert, as the page shows it now: a press on the picture hands focus back to it. */
function openKeyOf(alertId: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${OPEN_KEY_MARK}]`))
    .find((el) => el.getAttribute(OPEN_KEY_MARK) === alertId) ?? null;
}

/**
 * Open picture: an outlined key, shown while the alert has a picture to open
 * (one on its way, one that shows, or one that could not be read, which the
 * opened picture offers to delete). Its name adds the kind and the time,
 * and in History the day.
 */
export function OpenPictureKey({ alert, withDate = false }: { alert: Alert; withDate?: boolean }) {
  const kind = kindOfAlert(alert);
  const view = usePicture(alert.pictureId);
  if (!kind || !alert.pictureId) return null;
  if (view.status !== 'loading' && view.status !== 'shown' && view.status !== 'unreadable') return null;
  return (
    <button
      type="button"
      className="alert-pictures-key alert-picture__open"
      aria-label={openPictureName(kind, alertMoment(alert), withDate)}
      {...{ [OPEN_KEY_MARK]: alert.id }}
      onClick={(event) => openPicture(alert, event.currentTarget)}
    >
      {OPEN_PICTURE}
    </button>
  );
}

export function PictureBlock({ alert, form }: PictureBlockProps) {
  const kind = kindOfAlert(alert);
  const view = usePicture(alert.pictureId);
  const store = usePictureStoreState();
  if (!kind) return null;

  const at = alertMoment(alert);
  const empty = emptyLine(view);
  // The block takes focus when its picture's key has gone with the picture.
  const mark = { [PICTURE_BLOCK_MARK]: alert.id, tabIndex: -1 };
  const press = () => openPicture(alert, openKeyOf(alert.id));

  if (empty) {
    return (
      <div className="alert-picture" data-form={form} data-status={view.status} {...mark}>
        <Words kind={kind} at={at} zone={alert.zone}>
          <p className="alert-picture__quiet alert-picture__why">
            {empty.problem ? <ProblemGlyph /> : <EmptyFrameGlyph />}
            <span>{empty.line}</span>
          </p>
        </Words>
      </div>
    );
  }

  if (view.status !== 'shown' || view.kept === 'saving') {
    // The card and its sound come at once; a tile stands in the picture's place until it is drawn and saved.
    return (
      <div className="alert-picture" data-form={form} data-status="loading" {...mark}>
        <div className={form === 'large' ? 'alert-picture__wait' : 'alert-picture__wait alert-picture__wait--tile'} aria-hidden="true" />
        <Words kind={kind} at={at} zone={alert.zone} />
      </div>
    );
  }

  const { set, frameUrl, closeUpUrl } = view;
  // A picture this device could not save says so. One that is not kept by the person's choice
  // says that and links to the switch; a window that keeps nothing and a tab that waits for a
  // reload say it once elsewhere, and their cards carry no line of their own.
  const failed = view.kept === 'failed';
  const notKept = view.kept === 'memory' && store === 'usable';

  if (form === 'small') {
    return (
      <div className="alert-picture" data-form="small" data-status="shown" {...mark}>
        {closeUpUrl ? (
          <CloseUp set={set} url={closeUpUrl} at={at} onPress={press} />
        ) : (
          <Moment set={set} url={frameUrl} at={at} className="alert-picture__tile alert-picture__tile--whole" onPress={press} />
        )}
        <Words kind={kind} at={at} zone={alert.zone} />
      </div>
    );
  }

  return (
    <div className="alert-picture" data-form="large" data-status="shown" data-pictures={closeUpUrl ? 'two' : 'one'} {...mark}>
      <Moment set={set} url={frameUrl} at={at} className="alert-picture__frame" onPress={press} />
      <div className="alert-picture__side">
        {closeUpUrl && <CloseUp set={set} url={closeUpUrl} at={at} onPress={press} />}
        <Words kind={kind} at={at} zone={alert.zone}>
          {closeUpUrl && <p className="alert-picture__quiet alert-picture__label">{CLOSE_UP}</p>}
          {kind === 'sound' && <p className="alert-picture__quiet">{SOUND_LINE}</p>}
        </Words>
      </div>
      {(kind === 'picture-change' || set.dark || failed || notKept) && (
        <div className="alert-picture__notes">
          {failed && (
            <p className="alert-picture__quiet alert-picture__why">
              <ProblemGlyph />
              <span>{SAVE_FAILED}</span>
            </p>
          )}
          {notKept && (
            <>
              <p className="alert-picture__quiet">{NOT_KEPT_LINE}</p>
              <p className="alert-picture__link-row">
                <a
                  className="alert-picture__link"
                  href={KEEP_SWITCH_HASH}
                  onClick={() => window.dispatchEvent(new Event(OPEN_GROUP_EVENT))}
                >
                  {KEEP_SWITCH}
                </a>
              </p>
            </>
          )}
          {kind === 'picture-change' && <p className="alert-picture__quiet">{PICTURE_CHANGE_LINE}</p>}
          {set.dark && <p className="alert-picture__quiet">{DARK_LINE}</p>}
        </div>
      )}
    </div>
  );
}

export default PictureBlock;

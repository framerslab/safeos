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
import { recordTime } from '../../lib/alert-groups';
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
  dateAtTime,
  deletedAfter,
  inZone,
  kindAtTime,
  kindWords,
  levelWords,
  openPictureName,
  openSightingName,
  pictureName,
  savedPhotoName,
  sightingLines,
  sightingQuestion,
  timeWords,
} from '../../lib/alert-pictures/words';
import { petNameOf, usePetPhoto } from '../../lib/alert-pictures/pet-photo';
import { KEEP_SWITCH_HASH, OPEN_GROUP_EVENT } from './AlertPicturesGroup';
import { EmptyFrameGlyph, ProblemGlyph } from './Glyphs';
import { PICTURE_BLOCK_MARK, openPicture } from '../../lib/alert-pictures/opened';

/** The mark on an alert's Open picture key. */
const OPEN_KEY_MARK = 'data-open-picture';

interface PictureBlockProps {
  alert: Alert;
  /** The newest card's large form, the other cards' small form, or a History row's. */
  form: 'large' | 'small' | 'row';
}

/**
 * The time a card's words say: its newest alert's. A time that does not parse is read by the
 * alerts' own rule (its other date, else the time its id carries); now only when none is known.
 */
export function alertMoment(alert: Alert): number {
  const at = Date.parse(cardTime(alert) ?? '');
  return Number.isFinite(at) ? at : recordTime(alert) ?? Date.now();
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
  /** The browser cannot draw the picture's file. */
  onUnreadable?: () => void;
}

/** The picture of the moment at its own shape, with its box drawn over it. */
export function Moment({ set, url, at, className, boxed = Boolean(set.box), onPress, onUnreadable }: MomentProps) {
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
          onError={onUnreadable}
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

/**
 * A sighting's words: the question at 600, the time on its own line and,
 * where `lines` is set, the two lines that say what the comparison read and
 * that it can be another animal.
 */
function SightingWords({ alert, at, lines = false, children }: { alert: Alert; at: number; lines?: boolean; children?: React.ReactNode }) {
  const name = petNameOf(alert);
  return (
    <div className="alert-picture__words">
      <p className="alert-picture__lead" data-lead="">{sightingQuestion(name)}</p>
      <p className="alert-picture__time">{timeWords(at)}</p>
      {lines && sightingLines(name).map((line) => <p key={line} className="alert-picture__quiet">{line}</p>)}
      {children}
    </div>
  );
}

/** A card's words: the kind and the time, or a sighting's question and time. */
function BlockWords({ alert, kind, at, lines = false, children }: { alert: Alert; kind: AlertKind; at: number; lines?: boolean; children?: React.ReactNode }) {
  if (kind === 'sighting') return <SightingWords alert={alert} at={at} lines={lines}>{children}</SightingWords>;
  return <Words kind={kind} at={at} zone={alert.zone}>{children}</Words>;
}

/**
 * The pet's saved photo in a tile beside a sighting's close-up, with its
 * quiet label under it; nothing where the pet has none.
 */
export function PetTile({ alert }: { alert: Alert }) {
  const photo = usePetPhoto(alert.subjectId);
  if (!photo) return null;
  const name = savedPhotoName(petNameOf(alert));
  return (
    <PairItem label={name}>
      <div className="alert-picture__tile alert-picture__tile--pet">
        <img className="alert-picture__image" src={photo} alt={name} draggable={false} />
      </div>
    </PairItem>
  );
}

/**
 * One of a sighting's two tiles with its quiet label under it, so the two
 * pictures are told apart at a glance. The picture's own name says the same
 * to a screen reader, so the label is not read twice.
 */
function PairItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="alert-picture__pair-item">
      {children}
      <p className="alert-picture__quiet alert-picture__pair-label" aria-hidden="true">{label}</p>
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
      aria-label={kind === 'sighting'
        ? openSightingName(petNameOf(alert), alertMoment(alert), withDate)
        : openPictureName(kind, alertMoment(alert), withDate)}
      {...{ [OPEN_KEY_MARK]: alert.id }}
      onClick={(event) => openPicture(alert, event.currentTarget)}
    >
      {OPEN_PICTURE}
    </button>
  );
}

/** A History row's words: the kind and its level on one line, then the date and the time. */
function RowWords({ kind, at, alert, children }: { kind: AlertKind; at: number; alert: Alert; children?: React.ReactNode }) {
  return (
    <div className="alert-picture__words">
      {kind === 'sighting' ? (
        // A sighting is asked about, with no level.
        <p className="alert-picture__lead" data-lead="">{sightingQuestion(petNameOf(alert))}</p>
      ) : (
        <p className="alert-picture__lead" data-lead="">
          <span className="alert-picture__kind">{kindWords(kind)}</span>{' '}
          <span className="alert-picture__level">{levelWords(alert.severity)}</span>
        </p>
      )}
      <p className="alert-picture__quiet">{dateAtTime(at)}</p>
      {alert.zone && <p className="alert-picture__quiet alert-picture__zone">{inZone(alert.zone)}</p>}
      {children}
    </div>
  );
}

/**
 * A History row's block: the thumbnail in its 4:3 tile (the close-up, or the
 * whole picture where there is none), beside the kind, the level, the date
 * and the time. A picture that is gone leaves its words and the line that
 * says why; one that cannot be read leaves the problem glyph in the tile's
 * place and its line under the words.
 */
function RowBlock({ alert, kind, view, at, press }: { alert: Alert; kind: AlertKind; view: PictureView; at: number; press: () => void }) {
  const mark = { [PICTURE_BLOCK_MARK]: alert.id, tabIndex: -1 };
  const empty = emptyLine(view);
  if (empty && !empty.problem) {
    return (
      <div className="alert-picture" data-form="row" data-status={view.status} {...mark}>
        <RowWords kind={kind} at={at} alert={alert}>
          <p className="alert-picture__quiet alert-picture__why">
            <EmptyFrameGlyph />
            <span>{empty.line}</span>
          </p>
        </RowWords>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="alert-picture" data-form="row" data-status={view.status} {...mark}>
        <div className="alert-picture__tile alert-picture__tile--problem" aria-hidden="true"><ProblemGlyph /></div>
        <RowWords kind={kind} at={at} alert={alert}>
          <p className="alert-picture__quiet">{empty.line}</p>
        </RowWords>
      </div>
    );
  }
  if (view.status !== 'shown' || view.kept === 'saving') {
    return (
      <div className="alert-picture" data-form="row" data-status="loading" {...mark}>
        <div className="alert-picture__wait alert-picture__wait--tile" aria-hidden="true" />
        <RowWords kind={kind} at={at} alert={alert} />
      </div>
    );
  }
  const { set, frameUrl, closeUpUrl } = view;
  return (
    <div className="alert-picture" data-form="row" data-status="shown" {...mark}>
      {closeUpUrl ? (
        <CloseUp set={set} url={closeUpUrl} at={at} onPress={press} />
      ) : (
        <Moment set={set} url={frameUrl} at={at} className="alert-picture__tile alert-picture__tile--whole" onPress={press} />
      )}
      <RowWords kind={kind} at={at} alert={alert} />
    </div>
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

  if (form === 'row') return <RowBlock alert={alert} kind={kind} view={view} at={at} press={press} />;

  if (empty) {
    return (
      <div className="alert-picture" data-form={form} data-kind={kind} data-status={view.status} {...mark}>
        <BlockWords alert={alert} kind={kind} at={at}>
          <p className="alert-picture__quiet alert-picture__why">
            {empty.problem ? <ProblemGlyph /> : <EmptyFrameGlyph />}
            <span>{empty.line}</span>
          </p>
        </BlockWords>
      </div>
    );
  }

  if (view.status !== 'shown' || view.kept === 'saving') {
    // The card and its sound come at once; a tile stands in the picture's place until it is drawn and saved.
    return (
      <div className="alert-picture" data-form={form} data-kind={kind} data-status="loading" {...mark}>
        <div className={form === 'large' ? 'alert-picture__wait' : 'alert-picture__wait alert-picture__wait--tile'} aria-hidden="true" />
        {kind === 'sighting' && form === 'large' && (
          <div className="alert-picture__pair">
            <PetTile alert={alert} />
          </div>
        )}
        <BlockWords alert={alert} kind={kind} at={at} lines={form === 'large'} />
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
    // A picture this device could not save keeps its line when a newer alert moves it to the small form.
    return (
      <div className="alert-picture" data-form="small" data-kind={kind} data-status="shown" {...mark}>
        {closeUpUrl ? (
          <CloseUp set={set} url={closeUpUrl} at={at} onPress={press} />
        ) : (
          <Moment set={set} url={frameUrl} at={at} className="alert-picture__tile alert-picture__tile--whole" onPress={press} />
        )}
        <BlockWords alert={alert} kind={kind} at={at}>
          {failed && (
            <p className="alert-picture__quiet alert-picture__why">
              <ProblemGlyph />
              <span>{SAVE_FAILED}</span>
            </p>
          )}
        </BlockWords>
      </div>
    );
  }

  if (kind === 'sighting') {
    // The camera's picture across the block, then the close-up and the pet's saved photo side
    // by side, then the question, the time and the two lines.
    return (
      <div className="alert-picture" data-form="large" data-kind="sighting" data-status="shown" {...mark}>
        <Moment set={set} url={frameUrl} at={at} className="alert-picture__frame" onPress={press} />
        <div className="alert-picture__pair">
          {closeUpUrl && (
            <PairItem label={CLOSE_UP}>
              <CloseUp set={set} url={closeUpUrl} at={at} onPress={press} />
            </PairItem>
          )}
          <PetTile alert={alert} />
        </div>
        <SightingWords alert={alert} at={at} lines />
        <Notes kind={kind} set={set} failed={failed} notKept={notKept} />
      </div>
    );
  }

  return (
    <div className="alert-picture" data-form="large" data-kind={kind} data-status="shown" data-pictures={closeUpUrl ? 'two' : 'one'} {...mark}>
      <Moment set={set} url={frameUrl} at={at} className="alert-picture__frame" onPress={press} />
      <div className="alert-picture__side">
        {closeUpUrl && <CloseUp set={set} url={closeUpUrl} at={at} onPress={press} />}
        <Words kind={kind} at={at} zone={alert.zone}>
          {closeUpUrl && <p className="alert-picture__quiet alert-picture__label">{CLOSE_UP}</p>}
          {kind === 'sound' && <p className="alert-picture__quiet">{SOUND_LINE}</p>}
        </Words>
      </div>
      <Notes kind={kind} set={set} failed={failed} notKept={notKept} />
    </div>
  );
}

/** The lines under a large block: a picture not saved or not kept, a Picture change's cause, a dark picture. */
function Notes({ kind, set, failed, notKept }: { kind: AlertKind; set: PictureSet; failed: boolean; notKept: boolean }) {
  return (
    <>
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
    </>
  );
}

export default PictureBlock;

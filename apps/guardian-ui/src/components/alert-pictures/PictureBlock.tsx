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
import { usePicture, type PictureView } from '../../lib/alert-pictures/keeper';
import type { PictureSet } from '../../lib/alert-pictures/capture';
import {
  CLOSE_UP,
  DARK_LINE,
  DELETED_BY_PERSON,
  NO_PICTURE,
  PICTURE_CHANGE_LINE,
  SOUND_LINE,
  UNREADABLE,
  closeUpName,
  deletedAfter,
  inZone,
  kindAtTime,
  pictureName,
} from '../../lib/alert-pictures/words';
import { EmptyFrameGlyph, ProblemGlyph } from './Glyphs';

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

/** The picture of the moment at its own shape, with its box drawn over it. */
function Moment({ set, url, at, className }: { set: PictureSet; url: string; at: number; className: string }) {
  return (
    <div className={className} data-tall={isTall(set) ? '' : undefined}>
      <div className="alert-picture__fit" style={{ aspectRatio: `${set.frameWidth} / ${set.frameHeight}` }}>
        <img
          className="alert-picture__image"
          src={url}
          alt={pictureName(Boolean(set.box), at)}
          width={set.frameWidth}
          height={set.frameHeight}
          draggable={false}
        />
        {set.box && <span className="alert-picture__box" style={boxStyle(set.box, set)} aria-hidden="true" />}
      </div>
    </div>
  );
}

function CloseUp({ set, url, at }: { set: PictureSet; url: string; at: number }) {
  return (
    <div className="alert-picture__tile">
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

export function PictureBlock({ alert, form }: PictureBlockProps) {
  const kind = kindOfAlert(alert);
  const view = usePicture(alert.pictureId);
  if (!kind) return null;

  const at = alertMoment(alert);
  const empty = emptyLine(view);

  if (empty) {
    return (
      <div className="alert-picture" data-form={form} data-status={view.status}>
        <Words kind={kind} at={at} zone={alert.zone}>
          <p className="alert-picture__quiet alert-picture__why">
            {empty.problem ? <ProblemGlyph /> : <EmptyFrameGlyph />}
            <span>{empty.line}</span>
          </p>
        </Words>
      </div>
    );
  }

  if (view.status !== 'shown') {
    // The card and its sound come at once; a tile stands in the picture's place until it is drawn.
    return (
      <div className="alert-picture" data-form={form} data-status="loading">
        <div className={form === 'large' ? 'alert-picture__wait' : 'alert-picture__wait alert-picture__wait--tile'} aria-hidden="true" />
        <Words kind={kind} at={at} zone={alert.zone} />
      </div>
    );
  }

  const { set, frameUrl, closeUpUrl } = view;

  if (form === 'small') {
    return (
      <div className="alert-picture" data-form="small" data-status="shown">
        {closeUpUrl ? (
          <CloseUp set={set} url={closeUpUrl} at={at} />
        ) : (
          <Moment set={set} url={frameUrl} at={at} className="alert-picture__tile alert-picture__tile--whole" />
        )}
        <Words kind={kind} at={at} zone={alert.zone} />
      </div>
    );
  }

  return (
    <div className="alert-picture" data-form="large" data-status="shown" data-pictures={closeUpUrl ? 'two' : 'one'}>
      <Moment set={set} url={frameUrl} at={at} className="alert-picture__frame" />
      <div className="alert-picture__side">
        {closeUpUrl && <CloseUp set={set} url={closeUpUrl} at={at} />}
        <Words kind={kind} at={at} zone={alert.zone}>
          {closeUpUrl && <p className="alert-picture__quiet alert-picture__label">{CLOSE_UP}</p>}
          {kind === 'sound' && <p className="alert-picture__quiet">{SOUND_LINE}</p>}
        </Words>
      </div>
      {(kind === 'picture-change' || set.dark) && (
        <div className="alert-picture__notes">
          {kind === 'picture-change' && <p className="alert-picture__quiet">{PICTURE_CHANGE_LINE}</p>}
          {set.dark && <p className="alert-picture__quiet">{DARK_LINE}</p>}
        </div>
      )}
    </div>
  );
}

export default PictureBlock;

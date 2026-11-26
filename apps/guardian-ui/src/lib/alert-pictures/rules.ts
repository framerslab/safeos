/**
 * The rules an alert's picture is kept and shown by.
 *
 * Pure functions and constants: the box round what set an alert off (from
 * the motion check's changed cells, the picture check's hotspots or a Lost
 * and Found region), the close-up cut round it, the kept sizes, where the
 * box lands on the live picture (the frame drawn object-cover), the dark
 * rule, the age rule, the kinds of alert that keep a picture and the name a
 * saved picture takes.
 *
 * @module lib/alert-pictures/rules
 */

export type AlertKind = 'motion' | 'sound' | 'picture-change' | 'sighting';

/** A rectangle in pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle in per cents of the frame (0 to 100), as the settings' zones are kept. */
export interface PercentZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The kept frame's long edge, never enlarged. */
export const FRAME_LONG_EDGE = 640;
export const FRAME_QUALITY = 0.7;
/** The close-up's long edge at most, never enlarged. */
export const CLOSE_UP_LONG_EDGE = 480;
export const CLOSE_UP_QUALITY = 0.8;
/** A kept frame whose mean brightness is under this, of 255, is dark. */
export const DARK_MEAN = 26;
/** The box on any photograph: a green line inside a dark line, in both looks. */
export const BOX_LINE = '#4ade80';
export const BOX_EDGE = '#0b131b';
/** A picture saved to the device's files with its box drawn in is a JPEG at this quality. */
export const SAVED_FILE_QUALITY = 0.92;
/** How long the live picture carries an alert's box. */
export const LIVE_BOX_MS = 10_000;
/** The smallest side of a box drawn on the live picture. */
export const MIN_LIVE_BOX_PX = 24;
/** How long a notification waits for its picture before it goes as words. */
export const NOTIFICATION_WAIT_MS = 300;

/**
 * The newest alert that asked for a notification, by the notification's tag (one tag an event).
 * A notification goes only while no newer alert of its event has asked for its own: one that
 * waited longer for its picture never replaces a newer one, a higher level's included.
 */
export function askNote(asked: Map<string, number>, tag: string, at: number): void {
  asked.set(tag, Math.max(asked.get(tag) ?? at, at));
}
export function staleNote(asked: ReadonlyMap<string, number>, tag: string, at: number): boolean {
  return (asked.get(tag) ?? at) > at;
}
/** An event's notes are let go once no alert of it has asked for a notification in this long. */
export const NOTE_KEEP_MS = 60_000;

/**
 * Lets go of the notes of events no alert has asked for in `NOTE_KEEP_MS`: a long watch keeps the
 * notes of its recent events alone. A notification waits for its picture for 300 ms at most, so
 * none of an event that old is waiting.
 */
export function forgetOldNotes(asked: Map<string, number>, turns: Map<string, Promise<void>>, now: number): void {
  for (const [tag, at] of asked) {
    if (now - at < NOTE_KEEP_MS) continue;
    asked.delete(tag);
    turns.delete(tag);
  }
}

/**
 * Shows an event's notifications one after another, in the order they come here: each waits until
 * the one before it has gone to the browser, so a slower answer from the browser never puts an
 * earlier notification over a later one. One that a newer alert of its event asked after, before
 * its turn came, does not show. `turns` holds each tag's last turn.
 */
export function showInTurn(
  turns: Map<string, Promise<void>>, asked: ReadonlyMap<string, number>, tag: string, at: number, show: () => Promise<unknown>,
): Promise<void> {
  const turn = (turns.get(tag) ?? Promise.resolve()).then(async () => {
    if (staleNote(asked, tag, at)) return;
    await show();
  }).catch(() => undefined);
  turns.set(tag, turn);
  return turn;
}
/** A notification's drawn copy: this long on its long edge, a JPEG at this quality. */
export const NOTIFICATION_LONG_EDGE = 640;
export const NOTIFICATION_QUALITY = 0.8;
/** The choices of "Delete pictures after", in days; null keeps them until the person deletes them. */
export const DELETE_AFTER_CHOICES = [1, 3, 7, 30, null] as const;

const DAY_MS = 86_400_000;

const finite = (...values: number[]) => values.every((value) => Number.isFinite(value));

/** The rectangle round every box given; null when none is given. */
function union(boxes: ReadonlyArray<Box>): Box | null {
  if (boxes.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const box of boxes) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** `box` clipped to a frame; null when nothing of it is inside or the frame has no size. */
function clipToFrame(box: Box, frameWidth: number, frameHeight: number): Box | null {
  if (!finite(box.x, box.y, box.width, box.height, frameWidth, frameHeight)) return null;
  if (frameWidth <= 0 || frameHeight <= 0 || box.width <= 0 || box.height <= 0) return null;
  const left = Math.max(0, box.x);
  const top = Math.max(0, box.y);
  const right = Math.min(frameWidth, box.x + box.width);
  const bottom = Math.min(frameHeight, box.y + box.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The rectangle round the motion check's changed cells whose centre lies
 * inside `zone` (every cell when `zone` is null); null when none does.
 */
export function boxFromCells(
  cells: ReadonlyArray<Box>, frameWidth: number, frameHeight: number, zone: PercentZone | null,
): Box | null {
  const inZone = zone
    ? cells.filter((cell) => {
      const cx = cell.x + cell.width / 2;
      const cy = cell.y + cell.height / 2;
      const left = (zone.x / 100) * frameWidth;
      const top = (zone.y / 100) * frameHeight;
      const right = ((zone.x + zone.width) / 100) * frameWidth;
      const bottom = ((zone.y + zone.height) / 100) * frameHeight;
      return cx >= left && cx <= right && cy >= top && cy <= bottom;
    })
    : cells;
  const box = union(inZone);
  return box ? clipToFrame(box, frameWidth, frameHeight) : null;
}

/** The rectangle round the picture check's hotspots, each a centre and a size in per cents. */
export function boxFromHotspots(
  hotspots: ReadonlyArray<{ x: number; y: number; width: number; height: number }>,
  frameWidth: number,
  frameHeight: number,
): Box | null {
  const boxes = hotspots
    .filter((spot) => finite(spot.x, spot.y, spot.width, spot.height) && spot.width > 0 && spot.height > 0)
    .map((spot) => {
      const width = (spot.width / 100) * frameWidth;
      const height = (spot.height / 100) * frameHeight;
      return { x: (spot.x / 100) * frameWidth - width / 2, y: (spot.y / 100) * frameHeight - height / 2, width, height };
    });
  const box = union(boxes);
  return box ? clipToFrame(box, frameWidth, frameHeight) : null;
}

/** A Lost and Found region clipped to the frame; null when missing, not finite, of no size or wholly outside. */
export function boxFromRegion(region: Partial<Box> | null | undefined, frameWidth: number, frameHeight: number): Box | null {
  if (!region) return null;
  const { x, y, width, height } = region;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return null;
  return clipToFrame({ x, y, width, height }, frameWidth, frameHeight);
}

/** True when the box covers more than half of the frame. */
export function coversOverHalf(box: Box, frameWidth: number, frameHeight: number): boolean {
  return box.width * box.height > (frameWidth * frameHeight) / 2;
}

/**
 * The box an alert keeps: none for Sound; none for a Picture change whose
 * box covers more than half of the frame (light or a shadow over the room);
 * otherwise the box.
 */
export function alertBox(kind: AlertKind, box: Box | null, frameWidth: number, frameHeight: number): Box | null {
  if (kind === 'sound' || !box) return null;
  if (kind === 'picture-change' && coversOverHalf(box, frameWidth, frameHeight)) return null;
  return box;
}

/**
 * The close-up's rectangle: the box widened by an eighth of its width and of
 * its height on each side, kept inside the frame; none where the box covers
 * more than half of the frame.
 */
export function closeUpRect(box: Box, frameWidth: number, frameHeight: number): Box | null {
  if (!finite(box.x, box.y, box.width, box.height) || box.width <= 0 || box.height <= 0) return null;
  if (coversOverHalf(box, frameWidth, frameHeight)) return null;
  const left = Math.max(0, Math.floor(box.x - box.width / 8));
  const top = Math.max(0, Math.floor(box.y - box.height / 8));
  const right = Math.min(frameWidth, Math.ceil(box.x + box.width + box.width / 8));
  const bottom = Math.min(frameHeight, Math.ceil(box.y + box.height + box.height / 8));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The size that fits `longEdge` on the longer side and keeps the shape: whole pixels, at least 1, never enlarged. */
export function fitLongEdge(width: number, height: number, longEdge: number): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function scaleBox(box: Box, scale: number): Box {
  return { x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale };
}

/** The mean brightness, 0 to 255, of every fourth pixel of RGBA data. */
export function meanLuma(rgba: ArrayLike<number>): number {
  let sum = 0;
  let count = 0;
  // Whole-number weights, so a flat grey reads as exactly its own level.
  for (let i = 0; i + 2 < rgba.length; i += 16) {
    sum += 299 * rgba[i] + 587 * rgba[i + 1] + 114 * rgba[i + 2];
    count += 1;
  }
  return count === 0 ? 0 : sum / count / 1000;
}

export function isDark(mean: number): boolean {
  return mean < DARK_MEAN;
}

/**
 * Where a box in the frame's pixels lands on a centred live picture. Null when
 * the frame's size is not known, or when under a quarter of the mapped box
 * lies inside the view. A box under 24 px a side grows round its centre to
 * 24 and is moved back inside the view.
 */
export function mapLiveBox(
  box: Box, frameWidth: number, frameHeight: number, viewWidth: number, viewHeight: number, fit: 'cover' | 'contain',
): Box | null {
  if (!finite(box.x, box.y, box.width, box.height, frameWidth, frameHeight, viewWidth, viewHeight)) return null;
  if (frameWidth <= 0 || frameHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) return null;
  const scaleForFit = fit === 'contain' ? Math.min : Math.max;
  const scale = scaleForFit(viewWidth / frameWidth, viewHeight / frameHeight);
  const offsetX = (viewWidth - frameWidth * scale) / 2;
  const offsetY = (viewHeight - frameHeight * scale) / 2;
  const mapped = {
    x: box.x * scale + offsetX,
    y: box.y * scale + offsetY,
    width: box.width * scale,
    height: box.height * scale,
  };
  const clipped = clipToFrame(mapped, viewWidth, viewHeight);
  if (!clipped || clipped.width * clipped.height < (mapped.width * mapped.height) / 4) return null;
  let { x, y, width, height } = clipped;
  const minWidth = Math.min(MIN_LIVE_BOX_PX, viewWidth);
  const minHeight = Math.min(MIN_LIVE_BOX_PX, viewHeight);
  if (width < minWidth) {
    x += (width - minWidth) / 2;
    width = minWidth;
  }
  if (height < minHeight) {
    y += (height - minHeight) / 2;
    height = minHeight;
  }
  x = Math.min(Math.max(0, x), viewWidth - width);
  y = Math.min(Math.max(0, y), viewHeight - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** The ids of the pictures at or past `days` old; none when `days` is null. */
export function expiredPictureIds(
  pictures: ReadonlyArray<{ id: string; takenAt: number }>, now: number, days: number | null,
): string[] {
  if (days === null) return [];
  return pictures.filter((picture) => now - picture.takenAt >= days * DAY_MS).map((picture) => picture.id);
}

const KINDS: ReadonlyArray<AlertKind> = ['motion', 'sound', 'picture-change', 'sighting'];
const ID_KINDS: Record<string, AlertKind> = { motion: 'motion', audio: 'sound', pixel: 'picture-change', sighting: 'sighting' };

/**
 * The kind of picture an alert keeps: its record's kind, else its id's
 * opening word (an alert saved before pictures has no kind); null for an
 * alert that keeps none (inactivity, a server's alert).
 */
export function kindOfAlert(alert: { id: string; kind?: AlertKind | string }): AlertKind | null {
  if (alert.kind && KINDS.includes(alert.kind as AlertKind)) return alert.kind as AlertKind;
  const word = typeof alert.id === 'string' ? alert.id.split('-')[0] : '';
  return ID_KINDS[word] ?? null;
}

const FILE_KINDS: Record<AlertKind, string> = {
  motion: 'motion',
  sound: 'sound',
  'picture-change': 'picture-change',
  sighting: 'lost-and-found',
};

/** The name a saved picture takes, in the device's local time. */
export function pictureFileName(kind: AlertKind, at: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
  const time = `${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  return `safeos-${FILE_KINDS[kind]}-${date}-${time}.jpg`;
}

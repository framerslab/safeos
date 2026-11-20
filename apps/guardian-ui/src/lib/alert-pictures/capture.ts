/**
 * The capture: an alert's picture set, drawn from the frame that raised it.
 *
 * The source (the check's own frame, or the camera's picture for a Sound
 * alert) is copied onto the capture's own canvas before anything waits, so
 * the set is that moment's picture whatever the camera does next. The kept
 * frame is the copy scaled to 640 px on its long edge, never enlarged, as a
 * JPEG; the close-up is cut from the full-size copy, never from a JPEG.
 *
 * The drawn copies are made from a kept set for one use and never stored:
 * the file Save picture hands the browser, the brightened view of a dark
 * picture, and the picture a notification carries.
 *
 * @module lib/alert-pictures/capture
 */

import { newAlertId } from '../alert-id';
import {
  BOX_EDGE,
  BOX_LINE,
  CLOSE_UP_LONG_EDGE,
  CLOSE_UP_QUALITY,
  FRAME_LONG_EDGE,
  FRAME_QUALITY,
  NOTIFICATION_LONG_EDGE,
  NOTIFICATION_QUALITY,
  SAVED_FILE_QUALITY,
  closeUpRect,
  fitLongEdge,
  isDark,
  meanLuma,
  scaleBox,
  type AlertKind,
  type Box,
} from './rules';

export interface PictureSet {
  id: string;
  kind: AlertKind;
  takenAt: number;
  /** The kept frame: the camera frame's own shape, 640 px on its long edge at most. */
  frame: Blob;
  frameWidth: number;
  frameHeight: number;
  /** The box in the kept frame's pixels. */
  box: Box | null;
  /** The camera frame's size. */
  sourceWidth: number;
  sourceHeight: number;
  /** The box in the camera frame's pixels. */
  sourceBox: Box | null;
  /** The close-up of the box; none for a Sound alert, a picture with no box or a box over half of the frame. */
  closeUp: Blob | null;
  closeUpWidth: number;
  closeUpHeight: number;
  /** The kept frame's mean brightness is under the dark line. */
  dark: boolean;
}

export interface CaptureInput {
  id: string;
  kind: AlertKind;
  at: number;
  source: ImageData | CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  sourceBox: Box | null;
}

/** A picture set's id: its own word, the alert's time and a random tail. */
export const newPictureId = (at: number): string => newAlertId('picture', at);

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas for the alert picture');
  return { canvas, ctx };
}

function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('the alert picture could not be drawn'))),
      'image/jpeg',
      quality,
    );
  });
}

const isImageData = (source: ImageData | CanvasImageSource): source is ImageData =>
  typeof ImageData !== 'undefined' && source instanceof ImageData;

/**
 * Draws an alert's picture set. Everything that reads the source runs before
 * the first wait: the full-size copy, the kept frame, its brightness and the
 * close-up's cut. Only the JPEG encoding waits.
 */
export async function capturePictureSet(input: CaptureInput): Promise<PictureSet> {
  const sourceWidth = Math.round(input.sourceWidth);
  const sourceHeight = Math.round(input.sourceHeight);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) throw new Error('the camera frame has no size');

  const full = canvasOf(sourceWidth, sourceHeight);
  if (isImageData(input.source)) full.ctx.putImageData(input.source, 0, 0);
  else full.ctx.drawImage(input.source, 0, 0, sourceWidth, sourceHeight);

  const size = fitLongEdge(sourceWidth, sourceHeight, FRAME_LONG_EDGE);
  const kept = canvasOf(size.width, size.height);
  kept.ctx.drawImage(full.canvas, 0, 0, size.width, size.height);
  const dark = isDark(meanLuma(kept.ctx.getImageData(0, 0, size.width, size.height).data));

  const sourceBox = input.sourceBox;
  const cut = sourceBox ? closeUpRect(sourceBox, sourceWidth, sourceHeight) : null;
  let closeCanvas: HTMLCanvasElement | null = null;
  let closeUpWidth = 0;
  let closeUpHeight = 0;
  if (cut && cut.width >= 1 && cut.height >= 1) {
    const closeSize = fitLongEdge(cut.width, cut.height, CLOSE_UP_LONG_EDGE);
    const close = canvasOf(closeSize.width, closeSize.height);
    close.ctx.drawImage(full.canvas, cut.x, cut.y, cut.width, cut.height, 0, 0, closeSize.width, closeSize.height);
    closeCanvas = close.canvas;
    closeUpWidth = closeSize.width;
    closeUpHeight = closeSize.height;
  }

  const [frame, closeUp] = await Promise.all([
    jpeg(kept.canvas, FRAME_QUALITY),
    closeCanvas ? jpeg(closeCanvas, CLOSE_UP_QUALITY) : Promise.resolve(null),
  ]);

  return {
    id: input.id,
    kind: input.kind,
    takenAt: input.at,
    frame,
    frameWidth: size.width,
    frameHeight: size.height,
    box: sourceBox ? scaleBox(sourceBox, size.width / sourceWidth) : null,
    sourceWidth,
    sourceHeight,
    sourceBox,
    closeUp,
    closeUpWidth: closeUp ? closeUpWidth : 0,
    closeUpHeight: closeUp ? closeUpHeight : 0,
    dark,
  };
}

// =============================================================================
// Drawn copies
// =============================================================================

/** A kept JPEG drawn onto a canvas of its own size. */
async function drawn(blob: Blob): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      const copy = canvasOf(bitmap.width, bitmap.height);
      copy.ctx.drawImage(bitmap, 0, 0);
      return copy;
    } finally {
      bitmap.close();
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('the alert picture could not be read'));
      image.src = url;
    });
    const copy = canvasOf(image.naturalWidth, image.naturalHeight);
    copy.ctx.drawImage(image, 0, 0);
    return copy;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Draws a box on a canvas: `line` px of the box's green inside the box's
 * own edge, and `edge` px of its dark line outside it, with square corners.
 */
export function drawBox(ctx: CanvasRenderingContext2D, box: Box, line: number, edge: number): void {
  const x = Math.round(box.x);
  const y = Math.round(box.y);
  const width = Math.max(2 * line, Math.round(box.width));
  const height = Math.max(2 * line, Math.round(box.height));
  const ring = (colour: string, left: number, top: number, w: number, h: number, thick: number) => {
    ctx.fillStyle = colour;
    ctx.fillRect(left, top, w, thick);
    ctx.fillRect(left, top + h - thick, w, thick);
    ctx.fillRect(left, top + thick, thick, h - 2 * thick);
    ctx.fillRect(left + w - thick, top + thick, thick, h - 2 * thick);
  };
  ring(BOX_EDGE, x - edge, y - edge, width + 2 * edge, height + 2 * edge, edge);
  ring(BOX_LINE, x, y, width, height, line);
}

/**
 * The file Save picture saves: the kept frame itself where no box is asked
 * for or the set has none; else a copy of it with the box drawn in. Never
 * the brightened view.
 */
export async function savedFile(set: PictureSet, withBox: boolean): Promise<Blob> {
  if (!withBox || !set.box) return set.frame;
  const copy = await drawn(set.frame);
  drawBox(copy.ctx, set.box, 2, 1);
  return jpeg(copy.canvas, SAVED_FILE_QUALITY);
}

/** The brightest channel value of a canvas's pixels, 0 to 255. */
function brightest(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const data = ctx.getImageData(0, 0, width, height).data;
  let most = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > most) most = data[i];
    if (data[i + 1] > most) most = data[i + 1];
    if (data[i + 2] > most) most = data[i + 2];
  }
  return most;
}

function stretch(ctx: CanvasRenderingContext2D, width: number, height: number, factor: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.round(data[i] * factor));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * factor));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * factor));
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * A dark picture's brightened view: canvas copies of the frame and the
 * close-up with their levels stretched by one factor, so the brightest part
 * of the picture reaches full white. Object URLs for the view alone; the
 * caller revokes them, and the kept files are never changed.
 */
export async function brightenedUrl(set: PictureSet): Promise<{ frame: string; closeUp: string | null }> {
  const frame = await drawn(set.frame);
  const most = brightest(frame.ctx, frame.canvas.width, frame.canvas.height);
  const factor = most > 0 ? 255 / most : 1;
  stretch(frame.ctx, frame.canvas.width, frame.canvas.height, factor);
  const close = set.closeUp ? await drawn(set.closeUp) : null;
  if (close) stretch(close.ctx, close.canvas.width, close.canvas.height, factor);
  const [frameBlob, closeBlob] = await Promise.all([
    jpeg(frame.canvas, SAVED_FILE_QUALITY),
    close ? jpeg(close.canvas, SAVED_FILE_QUALITY) : Promise.resolve(null),
  ]);
  return { frame: URL.createObjectURL(frameBlob), closeUp: closeBlob ? URL.createObjectURL(closeBlob) : null };
}

/** True in a browser that shows a notification's picture; elsewhere a notification is its words alone. */
export function showsNotificationPictures(): boolean {
  return typeof Notification !== 'undefined' && 'image' in Notification.prototype;
}

/**
 * The picture a notification carries: the kept frame at 640 px on its long
 * edge, with the box drawn in at twice the photograph's widths (4 px of its
 * green inside 2 px of its dark line) so it reads at a notification's size,
 * and no words. A data URL handed to the browser for that one notification
 * and never stored.
 */
export async function notificationCopy(set: PictureSet): Promise<string> {
  const frame = await drawn(set.frame);
  const scale = NOTIFICATION_LONG_EDGE / Math.max(frame.canvas.width, frame.canvas.height);
  const copy = canvasOf(Math.max(1, Math.round(frame.canvas.width * scale)), Math.max(1, Math.round(frame.canvas.height * scale)));
  copy.ctx.drawImage(frame.canvas, 0, 0, copy.canvas.width, copy.canvas.height);
  if (set.box) drawBox(copy.ctx, scaleBox(set.box, copy.canvas.width / set.frameWidth), 4, 2);
  return copy.canvas.toDataURL('image/jpeg', NOTIFICATION_QUALITY);
}

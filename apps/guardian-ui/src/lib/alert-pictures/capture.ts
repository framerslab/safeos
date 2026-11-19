/**
 * The capture: an alert's picture set, drawn from the frame that raised it.
 *
 * The source (the check's own frame, or the camera's picture for a Sound
 * alert) is copied onto the capture's own canvas before anything waits, so
 * the set is that moment's picture whatever the camera does next. The kept
 * frame is the copy scaled to 640 px on its long edge, never enlarged, as a
 * JPEG; the close-up is cut from the full-size copy, never from a JPEG.
 *
 * @module lib/alert-pictures/capture
 */

import { newAlertId } from '../alert-id';
import {
  CLOSE_UP_LONG_EDGE,
  CLOSE_UP_QUALITY,
  FRAME_LONG_EDGE,
  FRAME_QUALITY,
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

/**
 * The box on the live picture: for 10 seconds after a Motion or Picture
 * change alert, one box where the change was at the alert's moment, with a
 * plate that says the kind, the word "here" and the time.
 *
 * The box is the alert's frame's: its numbers are mapped through the live
 * picture's own crop (the frame drawn to cover a 16:9 box), so it lies on
 * the thing whatever the camera's shape. It is fixed, takes no press and is
 * not read by a screen reader: the alert itself is read once from the alert
 * list's status. Nothing slides or fades, under any motion setting.
 *
 * @module components/alert-pictures/LiveBox
 */

'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { coverBox, type Box } from '../../lib/alert-pictures/rules';

export interface LiveAlertBox {
  /** The alert's picture id: a newer alert's box takes the place of this one. */
  key: string;
  /** The box in the camera frame's pixels. */
  box: Box;
  frameWidth: number;
  frameHeight: number;
  /** The plate's lines: the kind, "here" and the time, then a second line where one shows. */
  lines: [string] | [string, string];
}

/** The page's own marks over the picture, which the plate stays clear of. */
export const LIVE_MARK = 'data-live-mark';

const GAP = 4;
const CLEAR = 8;

interface Rect { left: number; top: number; right: number; bottom: number }

const meets = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

type LiveBoxProps = Omit<LiveAlertBox, 'key'>;

export function LiveBox({ box, frameWidth, frameHeight, lines }: LiveBoxProps) {
  const root = useRef<HTMLDivElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ width: number; height: number } | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const [firstLineAlone, setFirstLineAlone] = useState(false);

  // The picture's size on the screen, as it stands and as it changes.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setView((now) => (
      now && now.width === el.clientWidth && now.height === el.clientHeight ? now : { width: el.clientWidth, height: el.clientHeight }
    ));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Where the frame's size is not known, or less than a quarter of the box falls inside the
  // part of the frame the live picture shows, nothing is drawn here; the card's picture has the box.
  const shown = view ? coverBox(box, frameWidth, frameHeight, view.width, view.height) : null;
  // From a tablet's width the plate is at most 420 px wide and 12 px clear of the picture's edges.
  const tablet = typeof window !== 'undefined' && window.innerWidth >= 768;
  const edge = tablet ? 12 : CLEAR;

  // The plate stands at the box's top left, outside the box; under its bottom left where the box
  // touches the picture's top; inside the picture always, and clear of the page's marks over it.
  useLayoutEffect(() => {
    const el = plate.current;
    const frame = root.current;
    if (!el || !frame || !view || !shown) {
      setPlace(null);
      return;
    }
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    // Two lines that would cover more than a third of the picture's height leave the first alone.
    if (lines.length === 2 && !firstLineAlone && height > view.height / 3) {
      setFirstLineAlone(true);
      return;
    }
    const clampLeft = (left: number) => Math.max(edge, Math.min(left, view.width - edge - width));
    const clampTop = (top: number) => Math.max(edge, Math.min(top, view.height - edge - height));
    const above = shown.y - GAP - height;
    const under = shown.y + shown.height + GAP;
    let top = above >= edge ? above : under + height <= view.height - edge ? under : clampTop(above);
    let left = clampLeft(shown.x);

    const origin = frame.getBoundingClientRect();
    const marks: Rect[] = Array.from(frame.parentElement?.querySelectorAll(`[${LIVE_MARK}]`) ?? []).map((mark) => {
      const rect = mark.getBoundingClientRect();
      return {
        left: rect.left - origin.left - CLEAR,
        top: rect.top - origin.top - CLEAR,
        right: rect.right - origin.left + CLEAR,
        bottom: rect.bottom - origin.top + CLEAR,
      };
    });
    for (let pass = 0; pass < marks.length; pass++) {
      const now: Rect = { left, top, right: left + width, bottom: top + height };
      const mark = marks.find((candidate) => meets(now, candidate));
      if (!mark) break;
      // Past the mark, on the side with room; a plate that fits neither side keeps its place.
      const below = mark.bottom;
      const over = mark.top - height;
      if (below + height <= view.height - edge) top = below;
      else if (over >= edge) top = over;
      else break;
    }
    left = clampLeft(left);
    top = clampTop(top);
    setPlace((now) => (now && now.left === left && now.top === top ? now : { left, top }));
  }, [view, shown?.x, shown?.y, shown?.width, shown?.height, edge, lines, firstLineAlone]);

  const maxWidth = view ? Math.max(0, tablet ? Math.min(420, view.width - 2 * edge) : view.width - 2 * edge) : undefined;

  return (
    <div ref={root} className="alert-live" aria-hidden="true">
      {shown && (
        <>
          <div className="alert-live__box" style={{ left: shown.x, top: shown.y, width: shown.width, height: shown.height }} />
          <div
            ref={plate}
            className="alert-live__plate"
            style={place ? { left: place.left, top: place.top, maxWidth } : { left: 0, top: 0, maxWidth, visibility: 'hidden' }}
          >
            <p>{lines[0]}</p>
            {lines.length === 2 && !firstLineAlone && <p>{lines[1]}</p>}
          </div>
        </>
      )}
    </div>
  );
}

export default LiveBox;

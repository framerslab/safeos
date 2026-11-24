/**
 * @jest-environment node
 *
 * A Picture change alert's box goes round what changed in the zone that
 * raised it. The pixel check names, for each zone, the parts of the picture
 * that changed inside that zone, taken before the list is cut to the ten
 * strongest, so a stronger change in another zone never pushes them out.
 */

import { PixelDetectionEngine } from '@/lib/pixel-detection';

class TestImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}
Object.assign(globalThis, { ImageData: TestImageData });

const SIDE = 80;

/** An 80 by 80 grey picture, each pixel's level given by `level`. */
function picture(level: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(SIDE * SIDE * 4);
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      const i = (y * SIDE + x) * 4;
      const v = level(x, y);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return new TestImageData(data, SIDE, SIDE) as unknown as ImageData;
}

/** The centres of a list of parts, as [x, y] in per cent, in reading order. */
const centres = (parts: ReadonlyArray<{ x: number; y: number }>) =>
  parts.map((part) => [part.x, part.y]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

it('names, for each zone, the parts of the picture that changed inside it, before the ten strongest are kept', () => {
  const engine = new PixelDetectionEngine({
    zones: [
      { id: 'left', x: 0, y: 0, width: 50, height: 100 },
      { id: 'right', x: 50, y: 0, width: 50, height: 100 },
    ],
  });
  // The check compares a picture with the one before the last: two still pictures come first.
  engine.analyzeImageData(picture(() => 0));
  engine.analyzeImageData(picture(() => 0));
  // Half of the left zone's top left part of the 8 by 8 grid changes; the whole right zone changes.
  const result = engine.analyzeImageData(picture((x, y) => ((x < 5 && y < 10) || x >= 40 ? 255 : 0)));

  // Across the picture the ten strongest are all on the right: the left zone's part is cut.
  expect(result.hotspots).toHaveLength(10);
  expect(result.hotspots.every((part) => part.x > 50)).toBe(true);

  const left = result.zoneStats?.find((zone) => zone.id === 'left');
  const right = result.zoneStats?.find((zone) => zone.id === 'right');
  // The left zone's own list holds its one part, half changed.
  expect(left?.hotspots && centres(left.hotspots)).toEqual([[6.25, 6.25]]);
  expect(left?.hotspots?.[0].intensity).toBe(50);
  // The right zone's own list holds only parts inside it.
  expect(right?.hotspots?.length).toBeGreaterThan(0);
  expect(right?.hotspots?.every((part: { x: number }) => part.x > 50)).toBe(true);
});

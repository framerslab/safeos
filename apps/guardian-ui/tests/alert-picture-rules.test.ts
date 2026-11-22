/**
 * @jest-environment node
 *
 * The rules an alert's picture is kept and shown by: the box round what
 * changed, the close-up cut round it, the kept sizes, where the box lands on
 * the live picture (drawn object-cover), the dark rule, the age rule, the
 * kinds of alert that keep a picture and the name a saved picture takes.
 */

import {
  alertBox,
  askNote,
  boxFromCells,
  boxFromHotspots,
  boxFromRegion,
  closeUpRect,
  coverBox,
  coversOverHalf,
  expiredPictureIds,
  fitLongEdge,
  isDark,
  kindOfAlert,
  meanLuma,
  pictureFileName,
  scaleBox,
  showInTurn,
  staleNote,
} from '@/lib/alert-pictures/rules';

describe('the live picture is the frame drawn object-cover', () => {
  test('a box maps through the crop and the scale', () => {
    expect(coverBox({ x: 100, y: 100, width: 200, height: 100 }, 640, 480, 320, 180)).toEqual({ x: 50, y: 20, width: 100, height: 50 });
  });

  test('a box above the crop shows nothing', () => {
    expect(coverBox({ x: 0, y: 0, width: 640, height: 40 }, 640, 480, 320, 180)).toBeNull();
  });

  test('a box three quarters inside is clipped to the picture', () => {
    expect(coverBox({ x: 0, y: 40, width: 640, height: 80 }, 640, 480, 320, 180)).toEqual({ x: 0, y: 0, width: 320, height: 30 });
  });

  test('a small box grows round its centre to 24 px a side', () => {
    // 18 by 13.5 at (135, 67.5)
    expect(coverBox({ x: 600, y: 300, width: 80, height: 60 }, 1280, 720, 288, 162)).toEqual({ x: 132, y: 62, width: 24, height: 24 });
  });

  test('a frame of unknown size shows nothing', () => {
    expect(coverBox({ x: 0, y: 0, width: 10, height: 10 }, 0, 0, 320, 180)).toBeNull();
  });
});

describe('the close-up', () => {
  test('widens the box by an eighth on each side', () => {
    expect(closeUpRect({ x: 100, y: 100, width: 80, height: 40 }, 640, 480)).toEqual({ x: 90, y: 95, width: 100, height: 50 });
  });

  test('stays inside the frame', () => {
    expect(closeUpRect({ x: 0, y: 0, width: 80, height: 40 }, 640, 480)).toEqual({ x: 0, y: 0, width: 90, height: 45 });
  });

  test('is not cut round a box over half of the frame', () => {
    expect(closeUpRect({ x: 0, y: 0, width: 640, height: 241 }, 640, 480)).toBeNull();
    expect(coversOverHalf({ x: 0, y: 0, width: 640, height: 241 }, 640, 480)).toBe(true);
  });

  test('is cut round a box of exactly half of the frame', () => {
    expect(closeUpRect({ x: 0, y: 0, width: 640, height: 240 }, 640, 480)).not.toBeNull();
    expect(coversOverHalf({ x: 0, y: 0, width: 640, height: 240 }, 640, 480)).toBe(false);
  });
});

describe('the kept sizes', () => {
  test('fit the long edge and keep the shape, never enlarged', () => {
    expect(fitLongEdge(1280, 720, 640)).toEqual({ width: 640, height: 360 });
    expect(fitLongEdge(640, 480, 640)).toEqual({ width: 640, height: 480 });
    expect(fitLongEdge(720, 1280, 640)).toEqual({ width: 360, height: 640 });
    expect(fitLongEdge(320, 240, 640)).toEqual({ width: 320, height: 240 });
    expect(fitLongEdge(1000, 500, 480)).toEqual({ width: 480, height: 240 });
  });

  test('a box scales with its frame', () => {
    expect(scaleBox({ x: 100, y: 50, width: 200, height: 100 }, 0.5)).toEqual({ x: 50, y: 25, width: 100, height: 50 });
  });
});

describe('the box round what changed', () => {
  const cell = (x: number, y: number) => ({ x, y, width: 40, height: 40 });

  test('takes in every changed cell with no zone', () => {
    expect(boxFromCells([cell(40, 40), cell(120, 80)], 640, 480, null)).toEqual({ x: 40, y: 40, width: 120, height: 80 });
  });

  test('takes in only the cells whose centre lies in the zone', () => {
    expect(boxFromCells([cell(40, 40), cell(400, 200)], 640, 480, { x: 50, y: 0, width: 50, height: 100 })).toEqual(cell(400, 200));
  });

  test('is none when no changed cell lies in the zone', () => {
    expect(boxFromCells([cell(40, 40)], 640, 480, { x: 50, y: 0, width: 50, height: 100 })).toBeNull();
  });

  test('a picture change hotspot is a centre and a size in per cents', () => {
    expect(boxFromHotspots([{ x: 50, y: 50, width: 12.5, height: 12.5 }], 640, 480)).toEqual({ x: 280, y: 210, width: 80, height: 60 });
  });

  test('a Lost and Found region is clipped to the frame', () => {
    expect(boxFromRegion({ x: 600, y: 400, width: 80, height: 160 }, 640, 480)).toEqual({ x: 600, y: 400, width: 40, height: 80 });
  });

  test('a missing, empty or outside region is no box', () => {
    for (const missing of [null, undefined, { x: 10, y: 10, width: 0, height: 20 }, { x: 700, y: 10, width: 20, height: 20 }, { x: NaN, y: 0, width: 5, height: 5 }]) {
      expect(boxFromRegion(missing, 640, 480)).toBeNull();
    }
  });

  test('a picture change over half of the frame has no box; motion keeps its box; sound has none', () => {
    expect(alertBox('picture-change', { x: 0, y: 0, width: 640, height: 300 }, 640, 480)).toBeNull();
    expect(alertBox('motion', { x: 0, y: 0, width: 640, height: 300 }, 640, 480)).toEqual({ x: 0, y: 0, width: 640, height: 300 });
    expect(alertBox('sound', { x: 0, y: 0, width: 10, height: 10 }, 640, 480)).toBeNull();
  });
});

describe('the dark rule', () => {
  const flat = (level: number) => Uint8ClampedArray.from({ length: 64 * 4 }, (_, i) => (i % 4 === 3 ? 255 : level));

  test('a mean brightness under 26 of 255 is dark', () => {
    expect(isDark(meanLuma(flat(25)))).toBe(true);
    expect(isDark(meanLuma(flat(26)))).toBe(false);
  });
});

describe('the age rule', () => {
  const now = Date.UTC(2026, 10, 19, 12);
  const day = 86_400_000;
  const kept = [
    { id: 'two-days', takenAt: now - 2 * day },
    { id: 'half-day', takenAt: now - day / 2 },
    { id: 'three-days', takenAt: now - 3 * day },
  ];

  test('a picture past the chosen days is deleted', () => {
    expect(expiredPictureIds(kept, now, 1)).toEqual(['two-days', 'three-days']);
  });

  test('a picture at the chosen age is past it', () => {
    expect(expiredPictureIds(kept, now, 3)).toEqual(['three-days']);
  });

  test('Until I delete them deletes none', () => {
    expect(expiredPictureIds(kept, now, null)).toEqual([]);
  });
});

describe('the kinds of alert that keep a picture', () => {
  test('read from the alert id when the record has no kind', () => {
    expect(kindOfAlert({ id: 'motion-1763500000000-abcdefg' })).toBe('motion');
    expect(kindOfAlert({ id: 'audio-1763500000000-abcdefg' })).toBe('sound');
    expect(kindOfAlert({ id: 'pixel-1763500000000-abcdefg' })).toBe('picture-change');
  });

  test('an inactivity alert and a server alert keep none', () => {
    expect(kindOfAlert({ id: 'inactivity-1763500000000-abcdefg' })).toBeNull();
    expect(kindOfAlert({ id: 'server-1763500000000-abcdefg' })).toBeNull();
  });

  test('the record kind wins', () => {
    expect(kindOfAlert({ id: 'anything', kind: 'sighting' })).toBe('sighting');
  });
});

describe('a saved picture name', () => {
  test('names the kind and the local date and time', () => {
    const at = new Date(2026, 10, 19, 9, 4, 5);
    expect(pictureFileName('motion', at)).toBe('safeos-motion-2026-11-19-090405.jpg');
    expect(pictureFileName('picture-change', at)).toBe('safeos-picture-change-2026-11-19-090405.jpg');
    expect(pictureFileName('sighting', at)).toBe('safeos-lost-and-found-2026-11-19-090405.jpg');
  });
});

describe('the order of an event’s notifications', () => {
  it('leaves out a notification whose picture came after a newer alert of its event asked for its own', () => {
    const asked = new Map<string, number>();
    // A low alert waits for its picture; a critical alert of the same event comes 150 ms later.
    askNote(asked, 'safeos-Motion alert-e1', 1_000);
    askNote(asked, 'safeos-Motion alert-e1', 1_150);
    expect(staleNote(asked, 'safeos-Motion alert-e1', 1_150)).toBe(false);
    // The low alert's notification, ready after the critical one, does not replace it.
    expect(staleNote(asked, 'safeos-Motion alert-e1', 1_000)).toBe(true);
    // Another event's notification stands apart.
    askNote(asked, 'safeos-Motion alert-e2', 1_100);
    expect(staleNote(asked, 'safeos-Motion alert-e2', 1_100)).toBe(false);
    // An earlier alert asked late does not move the newest back.
    askNote(asked, 'safeos-Motion alert-e1', 900);
    expect(staleNote(asked, 'safeos-Motion alert-e1', 1_150)).toBe(false);
  });

  it('shows an event\'s notifications in the order their alerts asked, whatever order the browser answers in', async () => {
    const asked = new Map<string, number>();
    const turns = new Map<string, Promise<void>>();
    const shown: string[] = [];
    // The browser's answer to each notification's request for the service worker, handed back by the test.
    const answer = () => {
      let give!: () => void;
      const given = new Promise<void>((resolve) => { give = resolve; });
      return { given, give };
    };
    const low = answer();
    const critical = answer();
    const tag = 'safeos-Motion alert-e1';
    // The low alert's notification is on its way to the browser when the critical alert asks for its own.
    askNote(asked, tag, 1_000);
    const first = showInTurn(turns, asked, tag, 1_000, async () => { await low.given; shown.push('low'); });
    await new Promise((resolve) => setTimeout(resolve, 0));
    askNote(asked, tag, 1_150);
    const second = showInTurn(turns, asked, tag, 1_150, async () => { await critical.given; shown.push('critical'); });
    // The browser answers the critical one first.
    critical.give();
    await new Promise((resolve) => setTimeout(resolve, 0));
    low.give();
    await Promise.all([first, second]);
    // The critical notification is the one that stands.
    expect(shown).toEqual(['low', 'critical']);
  });

  it('leaves out a notification that a newer alert of its event asked after, before its turn came', async () => {
    const asked = new Map<string, number>();
    const turns = new Map<string, Promise<void>>();
    const shown: string[] = [];
    const tag = 'safeos-Motion alert-e1';
    askNote(asked, tag, 1_000);
    askNote(asked, tag, 1_150);
    await Promise.all([
      showInTurn(turns, asked, tag, 1_000, async () => { shown.push('low'); }),
      showInTurn(turns, asked, tag, 1_150, async () => { shown.push('critical'); }),
    ]);
    expect(shown).toEqual(['critical']);
  });
});


/** @jest-environment node */
/**
 * The Lost and Found walk's reads of the browser's database, and the probe's
 * verdict
 *
 * The probe in the Pictures workflow reads what the watch kept with
 * readWatch, and a walk reads a saved pet with readPet. When the database
 * cannot be opened, or a store cannot be read, these reads fail with the
 * store's name: an empty answer would make the probe report that the watch
 * saved nothing, when the read is what failed. readWatch keeps whether each
 * saved frame raised the alert, and the verdict counts a frame as an alert
 * only when it did, and only inside the watch's 85 s. The real functions run
 * in node here, with a page whose evaluate runs the function against a
 * stand-in for the browser's indexedDB.
 */

import path from 'path';
import { execFileSync } from 'child_process';

const WALK = path.resolve(__dirname, '..', 'scripts', 'lost-found-walk.mjs');
const VERDICT = path.resolve(__dirname, '..', 'scripts', 'lost-found-verdict.mjs');

const runModule = (program: string) =>
  execFileSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8' }).trim();

// Runs `read` from the walk against a database that fails in the way named,
// and prints what the call returned or the message it failed with.
function readAgainst(read: 'readWatch' | 'readPet', failing: 'open' | 'getAll' | 'none', kept: Record<string, unknown[]> = {}): string {
  const program = `
    const walk = await import(${JSON.stringify(WALK)});
    const later = (fire) => setTimeout(fire, 0);
    const request = (fails, result) => {
      const asked = { result, error: fails ? new Error('the read was refused') : null };
      later(() => (fails ? asked.onerror?.() : asked.onsuccess?.()));
      return asked;
    };
    const database = {
      objectStoreNames: { contains: () => true },
      transaction: (store) => ({ objectStore: () => ({ getAll: () => request(${JSON.stringify(failing)} === 'getAll', ${JSON.stringify(kept)}[store] ?? []) }) }),
      close: () => {},
    };
    globalThis.indexedDB = {
      databases: async () => [{ name: 'safeos-guardian' }],
      open: () => request(${JSON.stringify(failing)} === 'open', database),
    };
    const page = { evaluate: async (fn, arg) => fn(arg) };
    try {
      console.log('returned ' + JSON.stringify(await walk[${JSON.stringify(read)}](page, 'Toffee')));
    } catch (err) {
      console.log('failed: ' + err.message);
    }
  `;
  return runModule(program);
}

// The probe's verdict on what the watch kept, the watch having gone live at
// 1,000,000 ms and run for 85 s with the alert line at 70.
function judge(saved: object[], sightings: object[] = []) {
  const program = `
    const { judgeWatch } = await import(${JSON.stringify(VERDICT)});
    const verdict = judgeWatch({ saved: ${JSON.stringify(saved)}, sightings: ${JSON.stringify(sightings)}, liveAt: 1000000, watchMs: 85000, alertLine: 70 });
    console.log(JSON.stringify(verdict));
  `;
  return JSON.parse(runModule(program));
}

describe('the walk reads the watch and the pet from the database, or fails saying which read failed', () => {
  it('readWatch fails naming the database when it cannot be opened', () => {
    expect(readAgainst('readWatch', 'open')).toMatch(/^failed: .*safeos-guardian/);
  });

  it('readWatch fails naming the store when the saved frames cannot be read', () => {
    expect(readAgainst('readWatch', 'getAll')).toMatch(/^failed: .*match_frame/);
  });

  it('readPet fails naming the database when it cannot be opened', () => {
    expect(readAgainst('readPet', 'open')).toMatch(/^failed: .*safeos-guardian/);
  });

  it('readPet fails naming the store when the saved pets cannot be read', () => {
    expect(readAgainst('readPet', 'getAll')).toMatch(/^failed: .*subject_profile/);
  });
});

describe('readWatch keeps whether each saved frame raised the alert', () => {
  it('passes the saved frame\'s own alerted mark through', () => {
    const out = readAgainst('readWatch', 'none', {
      match_frame: [{ id: 'f1', timestamp: 1012000, confidence: 88, details: {}, alerted: false }],
    });
    expect(JSON.parse(out.replace(/^returned /, '')).saved[0]).toMatchObject({ id: 'f1', score: 88, alerted: false });
  });
});

describe('the probe counts an alert only where the watch raised one, inside the watch', () => {
  it('does not count a frame over the line that the watch saved without alerting', () => {
    expect(judge([{ id: 'f1', at: 1012000, score: 88, alerted: false }])).toMatchObject({ alerted: false, firstAlert: null, overLine: 1 });
  });

  it('counts a frame the watch alerted on', () => {
    expect(judge([{ id: 'f1', at: 1012000, score: 88, alerted: true }])).toMatchObject({
      alerted: true,
      firstAlert: { kind: 'saved frame', id: 'f1' },
    });
  });

  it('reads a frame saved without the mark by its score against the alert line', () => {
    expect(judge([{ id: 'f1', at: 1012000, score: 70 }])).toMatchObject({ alerted: true, firstAlert: { id: 'f1' } });
    expect(judge([{ id: 'f2', at: 1012000, score: 69 }])).toMatchObject({ alerted: false });
  });

  it('leaves out what the watch kept after its 85 s', () => {
    expect(judge([{ id: 'late', at: 1085500, score: 88, alerted: true }], [{ id: 's1', at: 1090000 }])).toMatchObject({
      alerted: false,
      saved: [],
      sightings: [],
      best: null,
    });
  });

  it('takes the earlier of the first alerted frame and the first sighting', () => {
    const verdict = judge(
      [{ id: 'f1', at: 1005000, score: 90, alerted: true }, { id: 'f0', at: 1001000, score: 60, alerted: false }],
      [{ id: 's1', at: 1003000 }],
    );
    expect(verdict).toMatchObject({ alerted: true, firstAlert: { kind: 'sighting', id: 's1' }, firstSaved: { id: 'f0' }, best: { id: 'f1' } });
  });
});

// What the probe says of the pet the walk saved, given the subject_profile
// record readPet returned and the number of photos the walk added.
function petCheck(pet: object | null, photoCount = 3): string | null {
  const program = `
    const { savedPetProblem } = await import(${JSON.stringify(VERDICT)});
    console.log(JSON.stringify(savedPetProblem(${JSON.stringify(pet)}, ${photoCount})));
  `;
  return JSON.parse(runModule(program));
}

describe('the probe holds the pet to what the walk added before it watches', () => {
  it('fails when the pet was not saved, though the page shows it', () => {
    expect(petCheck(null)).toBe('the pet was not saved on the device');
  });

  it('fails when the saved pet holds fewer photos than were added', () => {
    expect(petCheck({ name: 'Toffee', referenceImages: ['a', 'b'] })).toBe('the saved pet holds 2 photos, not 3');
    expect(petCheck({ name: 'Toffee' })).toBe('the saved pet holds 0 photos, not 3');
  });

  it('passes a pet saved with every photo', () => {
    expect(petCheck({ name: 'Toffee', referenceImages: ['a', 'b', 'c'] })).toBeNull();
  });
});

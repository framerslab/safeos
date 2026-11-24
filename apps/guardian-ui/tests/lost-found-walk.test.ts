/** @jest-environment node */
/**
 * The Lost and Found walk's reads of the browser's database
 *
 * The probe in the Pictures workflow reads what the watch kept with
 * readWatch, and a walk reads a saved pet with readPet. When the database
 * cannot be opened, or a store cannot be read, these reads fail with the
 * store's name: an empty answer would make the probe report that the watch
 * saved nothing, when the read is what failed. The real functions run in
 * node here, with a page whose evaluate runs the function against a stand-in
 * for the browser's indexedDB.
 */

import path from 'path';
import { execFileSync } from 'child_process';

const WALK = path.resolve(__dirname, '..', 'scripts', 'lost-found-walk.mjs');

// Runs `read` from the walk against a database that fails in the way named,
// and prints what the call returned or the message it failed with.
function readAgainst(read: 'readWatch' | 'readPet', failing: 'open' | 'getAll'): string {
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
      transaction: () => ({ objectStore: () => ({ getAll: () => request(${JSON.stringify(failing)} === 'getAll', []) }) }),
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
  return execFileSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8' }).trim();
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

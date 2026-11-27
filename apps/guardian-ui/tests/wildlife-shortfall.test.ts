/** @jest-environment node */
/**
 * Measure fails when Wildlife's real watch does not get through its motion
 * gate (scripts/wildlife-shortfall.mjs), and says why. Wildlife's watch runs
 * after the laptop's model measurement; when that measurement stops, the
 * watch never runs, and the message gives the measurement's own error.
 */
import path from 'path';
import { spawnSync } from 'child_process';

const APP_ROOT = path.resolve(__dirname, '..');

function shortfall(results: unknown): string | null {
  const script = [
    `import { wildlifeShortfall } from ${JSON.stringify(path.join(APP_ROOT, 'scripts', 'wildlife-shortfall.mjs'))};`,
    `console.log(JSON.stringify(wildlifeShortfall(${JSON.stringify(results)})));`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout.trim());
}

const laptop = (model: object) => ({ class: 'laptop', cpuThrottlingRate: { value: 1, unit: 'x slower' }, model });
const play = (catSecond: number | null) => ({ frameReads: 12, inferences: [{ ms: 40 }], catSecond });

it('names the model measurement that stopped when the Wildlife watch never ran', () => {
  expect(shortfall({ runs: [laptop({ error: 'net::ERR_CONNECTION_RESET at the model download' })] })).toBe(
    'Wildlife’s watch did not run: the laptop’s model measurement stopped first (net::ERR_CONNECTION_RESET at the model download).',
  );
});

it('blames the motion gate only when the watch ran and made no model check', () => {
  expect(shortfall({ runs: [laptop({})], wildlife: { attempts: [play(3.76), { frameReads: 1, inferences: [], catSecond: null }] } }))
    .toBe('Wildlife did not complete a model check through its motion gate on both plays of the sample clip.');
  expect(shortfall({ runs: [laptop({})], wildlife: { attempts: [play(3.76), play(null)] } }))
    .toBe('Wildlife did not save a cat sighting on both watches of the sample clip.');
  expect(shortfall({ runs: [laptop({})], wildlife: { attempts: [play(3.76), play(4.03)] } })).toBeNull();
});

it('gives the watch’s own error when the watch stopped, and keeps the model measurement out of it', () => {
  expect(shortfall({ runs: [laptop({})], wildlife: { attempts: [], error: 'Error: Target page, context or browser has been closed' } }))
    .toBe('Wildlife’s watch stopped before both plays of the sample clip (Error: Target page, context or browser has been closed).');
});

it('gives a watch’s own error when it stopped after its model check, in place of blaming the motion gate', () => {
  const stopped = { attempt: 1, ...play(3.76), error: 'Error: page.screenshot: Timeout 30000ms exceeded.' };
  expect(shortfall({ runs: [laptop({})], wildlife: { attempts: [stopped, { attempt: 2, ...play(4.03) }] } }))
    .toBe('Wildlife’s watch 1 stopped (Error: page.screenshot: Timeout 30000ms exceeded.).');
});


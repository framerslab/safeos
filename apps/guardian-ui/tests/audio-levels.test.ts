/**
 * The level the sound check reads from a pitch range.
 *
 * A synthetic spectrum stands in for the analyser: a tone is a peak a few bins
 * wide, the same shape in bins at every analyser size, as a windowed FFT gives
 * it. The level of a tone inside the range does not depend on how many bins
 * the range holds, so widening the range keeps its reading, and a tone outside
 * the range reads nothing.
 */
import { ANALYSER_SIZE, getAudioLevel, type PitchRange } from '@/lib/audio-levels';

const RATE = 48_000;

/** The byte spectrum of a tone at `hz`: a peak of 250 that falls to 0 four bins away. */
function toneSpectrum(fftSize: number, hz: number): Uint8Array {
  const bins = new Uint8Array(fftSize / 2);
  const centre = hz / (RATE / fftSize);
  for (let k = 0; k < bins.length; k++) {
    const distance = Math.abs(k - centre);
    if (distance <= 3) bins[k] = Math.round(250 * (1 - distance / 4));
  }
  return bins;
}

/** An analyser that hands out `bins`, at `fftSize`, as the browser's AnalyserNode does. */
function analyserOf(bins: Uint8Array, fftSize: number): AnalyserNode {
  return {
    fftSize,
    frequencyBinCount: fftSize / 2,
    context: { sampleRate: RATE },
    getByteFrequencyData: (out: Uint8Array) => out.set(bins),
  } as unknown as AnalyserNode;
}

const levelOf = (fftSize: number, hz: number, range: PitchRange | null) =>
  getAudioLevel(analyserOf(toneSpectrum(fftSize, hz), fftSize), range);

const NARROW = { low: 300, high: 3_000 };
const WIDE = { low: 20, high: 20_000 };

describe('getAudioLevel over a pitch range', () => {
  it.each([1024, 2048])('reads a 1 kHz tone the same at 300 to 3,000 Hz and at 20 to 20,000 Hz (analyser size %i)', (fftSize) => {
    const narrow = levelOf(fftSize, 1_000, NARROW);
    const wide = levelOf(fftSize, 1_000, WIDE);
    expect(narrow).toBeGreaterThan(0.05);
    expect(Math.abs(wide - narrow)).toBeLessThanOrEqual(0.01);
  });

  it('reads a 1 kHz tone the same at analyser sizes 1024 and 2048', () => {
    expect(Math.abs(levelOf(1024, 1_000, NARROW) - levelOf(2048, 1_000, NARROW))).toBeLessThanOrEqual(0.01);
  });

  it('reads a 1 kHz tone inside a range as every pitch reads it at the analyser size for every pitch', () => {
    const everyPitch = levelOf(ANALYSER_SIZE, 1_000, null);
    expect(Math.abs(levelOf(2048, 1_000, NARROW) - everyPitch)).toBeLessThanOrEqual(0.01);
  });

  it.each([1024, 2048])('reads a 100 Hz tone near 0 at 300 to 3,000 Hz (analyser size %i)', (fftSize) => {
    expect(levelOf(fftSize, 100, NARROW)).toBeLessThan(0.01);
  });

  it('reads every pitch as the root mean square of every bin, as saved sensitivities were set against', () => {
    const bins = new Uint8Array(ANALYSER_SIZE / 2).map((_, k) => (k * 37) % 256);
    const meanSquare = Array.from(bins).reduce((sum, b) => sum + b * b, 0) / bins.length;
    expect(getAudioLevel(analyserOf(bins, ANALYSER_SIZE), null)).toBeCloseTo(Math.sqrt(meanSquare) / 255, 10);
  });

  it('reads no more than 1 when a wide range holds many loud bins', () => {
    const loud = new Uint8Array(1024).fill(255);
    expect(getAudioLevel(analyserOf(loud, 2048), WIDE)).toBeLessThanOrEqual(1);
  });
});

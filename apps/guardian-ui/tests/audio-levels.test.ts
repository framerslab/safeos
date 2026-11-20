/**
 * The level the sound check reads from a pitch range.
 *
 * A synthetic spectrum stands in for the analyser: a tone is a peak a few bins
 * wide, the same shape in bins at every analyser size, as a windowed FFT gives
 * it. A range of up to REFERENCE_BINS bins, the Baby cry choice among them,
 * reads the root mean square of its own bins. A wider range reads the energy
 * of its bins against REFERENCE_BINS, as every pitch reads a tone, so widening
 * a range past REFERENCE_BINS bins never lowers a tone inside it. A tone
 * outside the range reads nothing.
 */
import {
  ANALYSER_SIZE,
  REFERENCE_BINS,
  analyserSizeFor,
  binsInRange,
  getAudioLevel,
  pitchRangeOf,
  type PitchRange,
} from '@/lib/audio-levels';

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

/** The root mean square of bins `first` to `last`, over their own count, from 0 to 1. */
function rootMeanSquare(bins: Uint8Array, first: number, last: number): number {
  let sum = 0;
  for (let i = first; i <= last; i++) sum += bins[i] * bins[i];
  return Math.sqrt(sum / (last - first + 1)) / 255;
}

/** The range the Baby cry choice reads, from the settings, as the sound check gets it. */
function babyCryRange(): PitchRange {
  const range = pitchRangeOf({ frequencyRange: 'baby_cry', customLowFreq: 0, customHighFreq: 0 });
  if (!range) throw new Error('the Baby cry choice reads no pitch range');
  return range;
}

const NARROW = { low: 300, high: 3_000 };
const WIDE = { low: 20, high: 20_000 };

describe('getAudioLevel over a pitch range', () => {
  it('the Baby cry choice reads a cry inside its pitches as loud as it did before: the root mean square of its own bins', () => {
    const range = babyCryRange();
    const size = analyserSizeFor(range);
    expect(range).toEqual({ low: 300, high: 600 });
    expect(size).toBe(2048);
    // 300 to 600 Hz is bins 13 to 25 at 2,048 points and 48 kHz: 13 bins, far fewer than REFERENCE_BINS.
    const [first, last] = binsInRange(range, size / 2, RATE, size);
    expect([first, last]).toEqual([13, 25]);

    const cry = toneSpectrum(size, 450);
    expect(getAudioLevel(analyserOf(cry, size), range)).toBeCloseTo(rootMeanSquare(cry, first, last), 10);

    // A sound that fills every bin of the range at 200 reads 200 / 255, as loud as its bins.
    const filled = new Uint8Array(size / 2).fill(200, first, last + 1);
    expect(getAudioLevel(analyserOf(filled, size), range)).toBeCloseTo(200 / 255, 10);
  });

  it('reads a 1 kHz tone at 300 to 3,000 Hz, 116 bins, as the root mean square of those bins', () => {
    const size = analyserSizeFor(NARROW);
    const [first, last] = binsInRange(NARROW, size / 2, RATE, size);
    expect(last - first + 1).toBe(116);
    expect(last - first + 1).toBeLessThan(REFERENCE_BINS);
    const tone = toneSpectrum(size, 1_000);
    expect(getAudioLevel(analyserOf(tone, size), NARROW)).toBeCloseTo(rootMeanSquare(tone, first, last), 10);
    // So it reads the tone the root of 128 / 116 above 20 to 20,000 Hz, about 5 per cent.
    expect(levelOf(size, 1_000, NARROW) / levelOf(size, 1_000, WIDE)).toBeCloseTo(Math.sqrt(REFERENCE_BINS / 116), 10);
  });

  it.each([
    { low: 200, high: 3_500 },
    { low: 500, high: 10_000 },
    WIDE,
  ])('reads a 1 kHz tone at $low to $high Hz, wider than REFERENCE_BINS bins, as every pitch reads it', (range) => {
    const size = analyserSizeFor(range);
    const [first, last] = binsInRange(range, size / 2, RATE, size);
    expect(last - first + 1).toBeGreaterThan(REFERENCE_BINS);
    expect(levelOf(size, 1_000, range)).toBeGreaterThan(0.05);
    expect(levelOf(size, 1_000, range)).toBeCloseTo(levelOf(ANALYSER_SIZE, 1_000, null), 10);
  });

  it('reads a 1 kHz tone at 20 to 20,000 Hz the same at analyser sizes 1024 and 2048, where the range holds 426 and 853 bins', () => {
    expect(levelOf(1024, 1_000, WIDE)).toBeCloseTo(levelOf(2048, 1_000, WIDE), 10);
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

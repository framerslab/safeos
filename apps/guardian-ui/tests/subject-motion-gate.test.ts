/** @jest-environment jsdom */

import { AnimalDetector, unloadAnimalModel } from '@/lib/animal-detection';
import { loadDetectionModel } from '@/lib/detection-model';
import { PersonDetector, unloadModel } from '@/lib/person-detection';

jest.mock('@/lib/detection-model', () => ({ loadDetectionModel: jest.fn() }));

const width = 320;
const height = 240;

function frame(levelAt: (x: number, y: number) => number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels.fill(levelAt(x, y), i, i + 3);
      pixels[i + 3] = 255;
    }
  }
  return new ImageData(pixels, width, height);
}

const still = () => frame(() => 100);
const subject = (left: number) => frame((x, y) => (
  x >= left && x < left + 60 && y >= 51 && y < 151 ? 180 : 100
));
const largeSubject = () => frame((x, y) => (x < 144 && y < 160 ? 180 : 100));
function noise() {
  let seed = 42;
  return frame(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 100 + (seed >>> 16) % 13 - 6;
  });
}

afterEach(() => {
  unloadModel();
  unloadAnimalModel();
  jest.restoreAllMocks();
});

describe.each([PersonDetector, AnimalDetector])('%p motion gate', (Detector) => {
  it.each([
    ['a 60 by 100 subject moving its width at an 80-level contrast', () => subject(21), () => subject(81), true],
    ['an 80-level change over 30 per cent of the picture', still, largeSubject, true],
    ['random noise within six levels', still, noise, false],
    ['five per cent brightness drift across the whole frame', still, () => frame(() => 113), false],
  ] as const)('handles %s', async (_label, first, second, opensGate) => {
    const detect = jest.fn().mockResolvedValue([]);
    jest.mocked(loadDetectionModel).mockResolvedValue({ detect } as unknown as Awaited<ReturnType<typeof loadDetectionModel>>);
    const read = jest.fn().mockReturnValueOnce(first()).mockReturnValueOnce(second());
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
      drawImage: jest.fn(), getImageData: read,
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext);

    const detector = new Detector({ captureFrames: false });
    await detector.initialize();
    const video = document.createElement('video');
    await detector.processFrame(video);
    expect(detect).not.toHaveBeenCalled();
    await detector.processFrame(video);
    expect(read).toHaveBeenCalledTimes(2);
    expect(detect).toHaveBeenCalledTimes(opensGate ? 1 : 0);
    detector.dispose();
  });
});

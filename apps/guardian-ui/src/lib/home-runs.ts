export const HOME_RUN_WIDE = '(min-width: 1280px)';

export type RunId = 'dashboard' | 'watching' | 'alert' | 'lost-found' | 'settings';
export type RunSize = 'square' | 'wide';
export type RunLook = 'light' | 'dark';

export interface RunFile {
  path: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
}

export interface RunWord {
  word: string;
  size: number;
  inkHeight?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RunVariant {
  video: RunFile & { kind: 'video'; format: 'mp4'; codec: 'h264'; seconds: number };
  poster: {
    webp: RunFile & { kind: 'poster'; format: 'webp' };
    avif?: RunFile & { kind: 'poster'; format: 'avif' };
  };
  crop: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  scale: number;
  words: RunWord[];
  posterAt: number;
  eventAt: number;
  meterPeaks?: { motion: number; sound: number };
  posterReading?: { clipAt: number };
  motionLine?: number;
  motionOverAt?: number;
  pictureAt?: number;
  watchEvents?: { kind: string; at: string; clipAt: number }[];
}

export interface HomeRun {
  id: RunId;
  key: string;
  route: string;
  state: string;
  clip: string | null;
  seconds: number;
  posterAt: number;
  eventAt: number;
  description: string;
  longDescription: string[];
  visibleWords: string[];
  variants: Record<RunSize, Record<RunLook, RunVariant>>;
}

export interface HomeRunManifest {
  schemaVersion: number;
  commit: string;
  run: string;
  inputDigest: string;
  runs: HomeRun[];
  omitted: Array<{ id: RunId; reason: string }>;
}

export const mediaPath = (file: RunFile) => '/' + file.path;

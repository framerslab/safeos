/**
 * Custom Media Player Tests
 * 
 * Unit tests for the custom media player library.
 * 
 * @module tests/custom-media-player.test
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock Howler
jest.mock('howler', () => ({
  Howl: jest.fn().mockImplementation(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    unload: jest.fn(),
  })),
}));

// Mock SpeechSynthesis
const mockSpeechSynthesis = {
  speak: jest.fn(),
  cancel: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  getVoices: jest.fn().mockReturnValue([]),
};

(global as any).window = {
  speechSynthesis: mockSpeechSynthesis,
};

(global as any).SpeechSynthesisUtterance = jest.fn().mockImplementation((text: unknown) => ({
  text,
  rate: 1,
  pitch: 1,
  volume: 1,
  onend: null,
  onerror: null,
}));

import {
  CustomMediaPlayer,
  getMediaPlayer,
  resetMediaPlayer,
  createUploadedImage,
  createUploadedAudio,
  formatDuration,
  isValidImageFile,
  isValidAudioFile,
  calculateMediaSize,
  formatBytes,
  DEFAULT_MEDIA_CONFIG,
  type UploadedImage,
  type UploadedAudio,
  type PlaybackMode,
} from '../src/lib/custom-media-player';
import { SPOKEN_DEFAULT } from '../src/lib/lost-found-words';

describe('CustomMediaPlayer', () => {
  beforeEach(() => {
    resetMediaPlayer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    resetMediaPlayer();
  });

  describe('initialization', () => {
    it('should create player with default config', () => {
      const player = new CustomMediaPlayer();
      expect(player).toBeDefined();
    });

    it('should accept custom config', () => {
      const player = new CustomMediaPlayer({
        playbackMode: 'loop',
        repeatCount: 5,
      });
      expect(player).toBeDefined();
    });

    it('should accept callbacks', () => {
      const callbacks = {
        onImageChange: jest.fn(),
        onAudioPlay: jest.fn(),
      };
      const player = new CustomMediaPlayer({}, callbacks);
      expect(player).toBeDefined();
    });
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const player = new CustomMediaPlayer();
      const state = player.getState();

      expect(state.isPlaying).toBe(false);
      expect(state.isPaused).toBe(false);
      expect(state.currentImageIndex).toBe(-1);
      expect(state.currentAudioIndex).toBe(-1);
      expect(state.completedCycles).toBe(0);
    });
  });

  describe('start', () => {
    it('should start playback', () => {
      const player = new CustomMediaPlayer();
      player.start();
      const state = player.getState();

      expect(state.isPlaying).toBe(true);
      expect(state.startTime).not.toBeNull();
    });

    it('should not start if already playing', () => {
      const player = new CustomMediaPlayer();
      player.start();
      const firstStartTime = player.getState().startTime;
      
      player.start();
      const secondStartTime = player.getState().startTime;

      expect(firstStartTime).toBe(secondStartTime);
    });
  });

  describe('stop', () => {
    it('should stop playback', () => {
      const player = new CustomMediaPlayer();
      player.start();
      player.stop();
      const state = player.getState();

      expect(state.isPlaying).toBe(false);
    });

    it('should call onPlaybackEnd callback', () => {
      const onPlaybackEnd = jest.fn();
      const player = new CustomMediaPlayer({}, { onPlaybackEnd });
      
      player.start();
      player.stop('manual');

      expect(onPlaybackEnd).toHaveBeenCalledWith('manual');
    });
  });

  describe('pause and resume', () => {
    it('should pause playback', () => {
      const player = new CustomMediaPlayer();
      player.start();
      player.pause();
      const state = player.getState();

      expect(state.isPaused).toBe(true);
      expect(state.isPlaying).toBe(true);
    });

    it('should resume playback', () => {
      const player = new CustomMediaPlayer();
      player.start();
      player.pause();
      player.resume();
      const state = player.getState();

      expect(state.isPaused).toBe(false);
      expect(state.isPlaying).toBe(true);
    });

    it('should not pause if not playing', () => {
      const player = new CustomMediaPlayer();
      player.pause();
      const state = player.getState();

      expect(state.isPaused).toBe(false);
    });
  });

  describe('config update', () => {
    it('should update config', () => {
      const player = new CustomMediaPlayer({ repeatCount: 3 });
      player.updateConfig({ repeatCount: 5 });
      // Config update doesn't expose state, but shouldn't throw
      expect(player).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should dispose resources', () => {
      const player = new CustomMediaPlayer();
      player.start();
      player.dispose();
      // Should stop playback
      expect(player.getState().isPlaying).toBe(false);
    });
  });
});

describe('Singleton Functions', () => {
  beforeEach(() => {
    resetMediaPlayer();
  });

  afterEach(() => {
    resetMediaPlayer();
  });

  it('should return same instance', () => {
    const player1 = getMediaPlayer();
    const player2 = getMediaPlayer();
    expect(player1).toBe(player2);
  });

  it('should update config on existing instance', () => {
    getMediaPlayer({ repeatCount: 3 });
    const player = getMediaPlayer({ repeatCount: 5 });
    expect(player).toBeDefined();
  });

  it('should create new instance after reset', () => {
    const player1 = getMediaPlayer();
    resetMediaPlayer();
    const player2 = getMediaPlayer();
    expect(player1).not.toBe(player2);
  });
});

describe('Utility Functions', () => {
  describe('formatDuration', () => {
    it('should format milliseconds correctly', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(3600000)).toBe('1h 0m');
    });
  });

  describe('isValidImageFile', () => {
    it('should validate image types', () => {
      const validJpeg = { type: 'image/jpeg' } as File;
      const validPng = { type: 'image/png' } as File;
      const invalidPdf = { type: 'application/pdf' } as File;

      expect(isValidImageFile(validJpeg)).toBe(true);
      expect(isValidImageFile(validPng)).toBe(true);
      expect(isValidImageFile(invalidPdf)).toBe(false);
    });
  });

  describe('isValidAudioFile', () => {
    it('should validate audio types', () => {
      const validMp3 = { type: 'audio/mpeg' } as File;
      const validWav = { type: 'audio/wav' } as File;
      const invalidPdf = { type: 'application/pdf' } as File;

      expect(isValidAudioFile(validMp3)).toBe(true);
      expect(isValidAudioFile(validWav)).toBe(true);
      expect(isValidAudioFile(invalidPdf)).toBe(false);
    });
  });

  describe('calculateMediaSize', () => {
    it('should calculate total size of media', () => {
      const images: UploadedImage[] = [
        {
          id: '1',
          name: 'test.jpg',
          data: 'data:image/jpeg;base64,AAAA', // ~4 bytes
          mimeType: 'image/jpeg',
          uploadedAt: Date.now(),
        },
      ];

      const audioFiles: UploadedAudio[] = [
        {
          id: '2',
          name: 'test.mp3',
          data: 'data:audio/mpeg;base64,BBBB', // ~4 bytes
          mimeType: 'audio/mpeg',
          uploadedAt: Date.now(),
        },
      ];

      const size = calculateMediaSize(images, audioFiles);
      expect(size).toBeGreaterThan(0);
    });

    it('should return 0 for empty arrays', () => {
      const size = calculateMediaSize([], []);
      expect(size).toBe(0);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1048576)).toBe('1.0 MB');
    });
  });
});

describe('Default Config', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_MEDIA_CONFIG.images).toEqual([]);
    expect(DEFAULT_MEDIA_CONFIG.audioFiles).toEqual([]);
    expect(DEFAULT_MEDIA_CONFIG.playbackMode).toBe('count');
    expect(DEFAULT_MEDIA_CONFIG.repeatCount).toBe(3);
    expect(DEFAULT_MEDIA_CONFIG.timerDurationMs).toBe(60000);
    expect(DEFAULT_MEDIA_CONFIG.displayIntervalMs).toBe(3000);
    expect(DEFAULT_MEDIA_CONFIG.shuffleOrder).toBe(false);
    expect(DEFAULT_MEDIA_CONFIG.ttsMessages).toEqual([]);
    expect(DEFAULT_MEDIA_CONFIG.ttsEnabled).toBe(true);
    expect(DEFAULT_MEDIA_CONFIG.audioEnabled).toBe(true);
    expect(DEFAULT_MEDIA_CONFIG.imageEnabled).toBe(true);
  });
});

describe('Playback Modes', () => {
  it('should support count mode', () => {
    const player = new CustomMediaPlayer({
      playbackMode: 'count',
      repeatCount: 3,
    });
    expect(player).toBeDefined();
  });

  it('should support loop mode', () => {
    const player = new CustomMediaPlayer({
      playbackMode: 'loop',
    });
    expect(player).toBeDefined();
  });

  it('should support timer mode', () => {
    const player = new CustomMediaPlayer({
      playbackMode: 'timer',
      timerDurationMs: 30000,
    });
    expect(player).toBeDefined();
  });
});


it('keeps a Lost and Found spoken alert quiet when only an online voice is available', () => {
  mockSpeechSynthesis.speak.mockClear();
  mockSpeechSynthesis.getVoices.mockReturnValueOnce([
    { name: 'Online English', lang: 'en-US', voiceURI: 'remote-en', localService: false, default: true },
  ]);
  const player = new CustomMediaPlayer({ ttsMessages: ['Could this be Stripes?'] });
  try {
    player.start();
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  } finally {
    player.dispose();
  }
});

it('speaks a Lost and Found message once the browser lists its voices', async () => {
  // A browser may list no voices until it has read them, then fire voiceschanged.
  const local = { name: 'Local English', lang: 'en-US', voiceURI: 'local-en', localService: true, default: true };
  let listed: unknown[] = [];
  const events = new EventTarget();
  mockSpeechSynthesis.speak.mockClear();
  mockSpeechSynthesis.getVoices.mockImplementation(() => listed);
  Object.assign(mockSpeechSynthesis, {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  const player = new CustomMediaPlayer({ ttsMessages: ['Could this be Stripes?'] });
  try {
    player.start();
    listed = [local];
    events.dispatchEvent(new Event('voiceschanged'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: local }));
  } finally {
    player.dispose();
    mockSpeechSynthesis.getVoices.mockImplementation(() => []);
    Reflect.deleteProperty(mockSpeechSynthesis, 'addEventListener');
    Reflect.deleteProperty(mockSpeechSynthesis, 'removeEventListener');
  }
});

it('speaks a Lost and Found message that waited for the voice list once a pause ends', async () => {
  const local = { name: 'Local English', lang: 'en-US', voiceURI: 'local-en', localService: true, default: true };
  let listed: unknown[] = [];
  const events = new EventTarget();
  mockSpeechSynthesis.speak.mockClear();
  mockSpeechSynthesis.getVoices.mockImplementation(() => listed);
  Object.assign(mockSpeechSynthesis, {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  const player = new CustomMediaPlayer({ ttsMessages: ['Could this be Stripes?'] });
  try {
    player.start();
    player.pause();
    listed = [local];
    events.dispatchEvent(new Event('voiceschanged'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();

    player.resume();
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: local }));
  } finally {
    player.dispose();
    mockSpeechSynthesis.getVoices.mockImplementation(() => []);
    Reflect.deleteProperty(mockSpeechSynthesis, 'addEventListener');
    Reflect.deleteProperty(mockSpeechSynthesis, 'removeEventListener');
  }
});

it("reads Lost and Found's own English line in an English voice on a page in another language", () => {
  const english = { name: 'Local English', lang: 'en-US', voiceURI: 'local-en', localService: true, default: false };
  const french = { name: 'Local French', lang: 'fr-FR', voiceURI: 'local-fr', localService: true, default: true };
  mockSpeechSynthesis.speak.mockClear();
  mockSpeechSynthesis.getVoices.mockImplementation(() => [french, english]);
  (global as any).document = { documentElement: { lang: 'fr' } };
  const own = new CustomMediaPlayer({ ttsMessages: [SPOKEN_DEFAULT] });
  const written = new CustomMediaPlayer({ ttsMessages: ['Est-ce Minou ?'] });
  try {
    own.start();
    expect(mockSpeechSynthesis.speak).toHaveBeenLastCalledWith(expect.objectContaining({ voice: english }));
    own.stop();
    written.start();
    expect(mockSpeechSynthesis.speak).toHaveBeenLastCalledWith(expect.objectContaining({ voice: french }));
  } finally {
    own.dispose();
    written.dispose();
    Reflect.deleteProperty(global, 'document');
    mockSpeechSynthesis.getVoices.mockImplementation(() => []);
  }
});

it('does not play a finished sound again when a pause ends between a sound and a message', async () => {
  // The player loads Howler before the mock above is set, so the sound is
  // made through the module it holds; this sound records its plays.
  const howler = jest.requireActual('howler') as { Howl: unknown };
  const sound = { play: jest.fn(), pause: jest.fn(), stop: jest.fn(), unload: jest.fn() };
  let options: { onend: () => void } | undefined;
  const made = jest.spyOn(howler as any, 'Howl').mockImplementation((given: any) => {
    options = given;
    return sound;
  });
  const local = { name: 'Local English', lang: 'en-US', voiceURI: 'local-en', localService: true, default: true };
  const clip: UploadedAudio = { id: 'a1', name: 'bark.mp3', data: 'data:audio/mpeg;base64,AA', mimeType: 'audio/mpeg', uploadedAt: 0 };
  mockSpeechSynthesis.speak.mockClear();
  mockSpeechSynthesis.getVoices.mockImplementation(() => [local]);
  const player = new CustomMediaPlayer({ audioFiles: [clip], ttsMessages: ['Could this be Stripes?'] });
  try {
    player.start();
    expect(made).toHaveBeenCalledTimes(1);
    expect(sound.play).toHaveBeenCalledTimes(1);

    // The sound ends; the next step comes due 500 ms later, during a pause.
    options?.onend();
    player.pause();
    await new Promise((resolve) => setTimeout(resolve, 600));
    player.resume();

    expect(sound.play).toHaveBeenCalledTimes(1);
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
  } finally {
    player.dispose();
    made.mockRestore();
    mockSpeechSynthesis.getVoices.mockImplementation(() => []);
  }
});

it('lets a step from a stopped playback play nothing in the next one', async () => {
  // A sound ends and its next step comes due 500 ms later. Before then the
  // playback stops, a new one starts with its own sound and pauses.
  const howler = jest.requireActual('howler') as { Howl: unknown };
  const sound = { play: jest.fn(), pause: jest.fn(), stop: jest.fn(), unload: jest.fn() };
  let options: { onend: () => void } | undefined;
  const made = jest.spyOn(howler as any, 'Howl').mockImplementation((given: any) => {
    options = given;
    return sound;
  });
  const local = { name: 'Local English', lang: 'en-US', voiceURI: 'local-en', localService: true, default: true };
  const clip: UploadedAudio = { id: 'a1', name: 'bark.mp3', data: 'data:audio/mpeg;base64,AA', mimeType: 'audio/mpeg', uploadedAt: 0 };
  mockSpeechSynthesis.speak.mockClear();
  mockSpeechSynthesis.getVoices.mockImplementation(() => [local]);
  const player = new CustomMediaPlayer({ audioFiles: [clip], ttsMessages: ['Could this be Stripes?'] });
  try {
    player.start();
    options?.onend();
    player.stop();
    player.start();
    expect(made).toHaveBeenCalledTimes(2);
    player.pause();
    await new Promise((resolve) => setTimeout(resolve, 600));
    player.resume();

    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  } finally {
    player.dispose();
    made.mockRestore();
    mockSpeechSynthesis.getVoices.mockImplementation(() => []);
  }
});

it('reports a Lost and Found message with no voice and speaks it once the browser lists one', async () => {
  const local = { name: 'Local English', lang: 'en-US', voiceURI: 'local-en', localService: true, default: true };
  let listed: unknown[] = [];
  const events = new EventTarget();
  mockSpeechSynthesis.speak.mockClear();
  mockSpeechSynthesis.getVoices.mockImplementation(() => listed);
  Object.assign(mockSpeechSynthesis, {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  const onError = jest.fn();
  const player = new CustomMediaPlayer({ ttsMessages: ['Could this be Stripes?'] }, { onError });
  try {
    player.start();
    // The voice list stays empty past the wait.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(player.getState().isPlaying).toBe(true);

    listed = [local];
    events.dispatchEvent(new Event('voiceschanged'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockSpeechSynthesis.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: local }));
    expect(onError).toHaveBeenCalledTimes(1);
  } finally {
    player.dispose();
    mockSpeechSynthesis.getVoices.mockImplementation(() => []);
    Reflect.deleteProperty(mockSpeechSynthesis, 'addEventListener');
    Reflect.deleteProperty(mockSpeechSynthesis, 'removeEventListener');
  }
});


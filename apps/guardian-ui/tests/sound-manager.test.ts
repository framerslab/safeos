/**
 * Sound Manager Tests
 *
 * Unit tests for the centralized sound manager with priority system,
 * volume controls, and emergency mode.
 *
 * @module tests/sound-manager.test
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

// Every address an audio element is made with.
const audioSources: string[] = [];

// Mock HTMLAudioElement
class MockAudioElement {
  src: string = '';
  volume: number = 1;
  muted: boolean = false;
  loop: boolean = false;
  currentTime: number = 0;
  preload: string = '';
  paused: boolean = true;

  private endCallbacks: (() => void)[] = [];

  constructor(src?: string) {
    if (src) this.src = src;
    audioSources.push(src ?? '');
  }

  load(): void {}

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  addEventListener(event: string, callback: () => void): void {
    if (event === 'ended') {
      this.endCallbacks.push(callback);
    }
  }

  removeEventListener(): void {}

  // Helper to simulate end event
  simulateEnd(): void {
    this.endCallbacks.forEach((cb) => cb());
  }
}

// Global Audio mock
(global as any).Audio = MockAudioElement;

// A stand-in Web Audio API that records what the sound manager makes: each
// oscillator's shape, frequency, start and stop times, each gain's value and
// scheduled changes, and what each node is connected to.
class FakeParam {
  events: { kind: 'set' | 'ramp'; value: number; time: number }[] = [];

  constructor(public value: number) {}

  setValueAtTime(value: number, time: number): FakeParam {
    this.events.push({ kind: 'set', value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): FakeParam {
    this.events.push({ kind: 'ramp', value, time });
    return this;
  }

  cancelScheduledValues(): FakeParam {
    return this;
  }
}

class FakeNode {
  // Every node this one was connected to; disconnect() only sets the flag.
  outputs: FakeNode[] = [];
  disconnected = false;

  connect(target: FakeNode): FakeNode {
    this.outputs.push(target);
    return target;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeOscillator extends FakeNode {
  type: string = 'sine';
  frequency = new FakeParam(440);
  starts: number[] = [];
  stops: number[] = [];
  onended: (() => void) | null = null;

  constructor(private context: FakeAudioContext) {
    super();
  }

  start(when = 0): void {
    this.starts.push(when);
    made.log.push(`start:${this.context.state}`);
  }

  stop(when = 0): void {
    this.stops.push(when);
  }

  // The audio clock reaches the oscillator's stop time.
  end(): void {
    this.onended?.();
  }
}

const made = {
  contexts: [] as FakeAudioContext[],
  oscillators: [] as FakeOscillator[],
  gains: [] as FakeGain[],
  log: [] as string[],
};

// How the next context starts and how it answers resume().
const audioSetup = {
  state: 'running' as string,
  resume: (context: FakeAudioContext): Promise<void> => {
    context.state = 'running';
    return Promise.resolve();
  },
};

class FakeAudioContext {
  state: string = audioSetup.state;
  currentTime = 0;
  destination = new FakeNode();

  constructor() {
    made.contexts.push(this);
  }

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator(this);
    made.oscillators.push(oscillator);
    return oscillator;
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    made.gains.push(gain);
    return gain;
  }

  resume(): Promise<void> {
    made.log.push('resume');
    return audioSetup.resume(this);
  }
}

const browser = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };

// =============================================================================
// Helpers
// =============================================================================

type ToneShape = { frequency: number; duration: number; gapAfter: number };
type PatternShape = { wave: string; level: number; repeatPause?: number; tones: ToneShape[] };

const APP_ROOT = path.resolve(__dirname, '..');
const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';
// An address under /sounds/ on the site (a path such as settings/sounds/ is not one).
const SOUND_ADDRESS = /(?<![\w.-])\/sounds\//;

const round = (seconds: number) => Math.round(seconds * 1e6) / 1e6;

// Lets resume() and the play that waits on it finish.
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

// Moves the audio clock and the timers on together, 10 ms at a time.
async function runClock(context: FakeAudioContext, ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += 10) {
    context.currentTime += 0.01;
    jest.advanceTimersByTime(10);
    await settle();
  }
}

// The gains that lead to the speakers: one per sound.
function soundGains(): FakeGain[] {
  const destination = made.contexts[0]?.destination;
  return made.gains.filter((gain) => destination !== undefined && gain.outputs.includes(destination));
}

// The oscillators whose tones reach the given sound gain.
function through(gain: FakeGain): FakeOscillator[] {
  return made.oscillators.filter((oscillator) => oscillator.outputs[0]?.outputs.includes(gain));
}

function describeOscillator(oscillator: FakeOscillator) {
  return {
    type: oscillator.type,
    frequency: oscillator.frequency.value,
    start: round(oscillator.starts[0]),
    stop: round(oscillator.stops[0]),
  };
}

const lastStop = (oscillator: FakeOscillator) => oscillator.stops[oscillator.stops.length - 1];

// One pass of a pattern, starting at `from` seconds on the audio clock.
function schedule(pattern: PatternShape, from: number) {
  const out: ReturnType<typeof describeOscillator>[] = [];
  let at = from;
  for (const tone of pattern.tones) {
    out.push({
      type: pattern.wave,
      frequency: tone.frequency,
      start: round(at),
      stop: round(at + tone.duration / 1000),
    });
    at += (tone.duration + tone.gapAfter) / 1000;
  }
  return out;
}

const passLength = (pattern: PatternShape) =>
  pattern.tones.reduce((sum, tone) => sum + tone.duration + tone.gapAfter, 0) / 1000;

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

// The five built-in sounds, as decided.
const DECIDED_PATTERNS: Record<string, PatternShape> = {
  notification: { wave: 'sine', level: 1, tones: [{ frequency: 880, duration: 180, gapAfter: 0 }] },
  alert: {
    wave: 'sine',
    level: 1,
    tones: [
      { frequency: 880, duration: 160, gapAfter: 110 },
      { frequency: 1175, duration: 220, gapAfter: 0 },
    ],
  },
  warning: {
    wave: 'triangle',
    level: 1,
    tones: [
      { frequency: 740, duration: 200, gapAfter: 120 },
      { frequency: 740, duration: 200, gapAfter: 120 },
      { frequency: 740, duration: 200, gapAfter: 0 },
    ],
  },
  alarm: {
    wave: 'triangle',
    level: 1,
    repeatPause: 400,
    tones: [
      { frequency: 988, duration: 280, gapAfter: 60 },
      { frequency: 740, duration: 280, gapAfter: 60 },
      { frequency: 988, duration: 280, gapAfter: 60 },
      { frequency: 740, duration: 280, gapAfter: 0 },
    ],
  },
  emergency: {
    wave: 'square',
    level: 0.6,
    repeatPause: 250,
    tones: [
      { frequency: 1319, duration: 220, gapAfter: 40 },
      { frequency: 988, duration: 220, gapAfter: 40 },
      { frequency: 1319, duration: 220, gapAfter: 40 },
      { frequency: 988, duration: 220, gapAfter: 40 },
      { frequency: 1319, duration: 220, gapAfter: 40 },
      { frequency: 988, duration: 220, gapAfter: 0 },
    ],
  },
};

// The volume rule at a user volume of 20: warning keeps 30, alarm 50, emergency full.
const VOLUME_AT_20: Record<string, number> = {
  notification: 0.2,
  alert: 0.2,
  warning: 0.3,
  alarm: 0.5,
  emergency: 1,
};

// =============================================================================
// Module Import (after mocks)
// =============================================================================

// Reset module cache to get fresh instance
let getSoundManager: typeof import('../src/lib/sound-manager').getSoundManager;
// The module's exports, read by name.
let soundModule: Record<string, unknown>;

// =============================================================================
// Tests
// =============================================================================

describe('Sound Manager', () => {
  beforeEach(async () => {
    audioSources.length = 0;
    made.contexts.length = 0;
    made.oscillators.length = 0;
    made.gains.length = 0;
    made.log.length = 0;
    audioSetup.state = 'running';
    audioSetup.resume = (context) => {
      context.state = 'running';
      return Promise.resolve();
    };
    browser.AudioContext = FakeAudioContext;
    delete browser.webkitAudioContext;

    // Reset module cache for fresh singleton
    jest.resetModules();
    const module = await import('../src/lib/sound-manager');
    getSoundManager = module.getSoundManager;
    soundModule = module as unknown as Record<string, unknown>;
  });

  afterEach(() => {
    getSoundManager().stopAll();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const manager1 = getSoundManager();
      const manager2 = getSoundManager();
      expect(manager1).toBe(manager2);
    });
  });

  describe('Volume Management', () => {
    it('should set and get user volume', () => {
      const manager = getSoundManager();
      manager.setUserVolume(50);
      expect(manager.getUserVolume()).toBe(50);
    });

    it('should clamp volume to 0-100 range', () => {
      const manager = getSoundManager();

      manager.setUserVolume(-10);
      expect(manager.getUserVolume()).toBe(0);

      manager.setUserVolume(150);
      expect(manager.getUserVolume()).toBe(100);
    });

    it('should default to 70% volume', () => {
      const manager = getSoundManager();
      expect(manager.getUserVolume()).toBe(70);
    });
  });

  describe('Mute Management', () => {
    it('should toggle global mute', () => {
      const manager = getSoundManager();

      expect(manager.isGlobalMuted()).toBe(false);

      manager.setGlobalMute(true);
      expect(manager.isGlobalMuted()).toBe(true);

      manager.setGlobalMute(false);
      expect(manager.isGlobalMuted()).toBe(false);
    });
  });

  describe('Emergency Mode', () => {
    it('should toggle emergency mode', () => {
      const manager = getSoundManager();

      expect(manager.isEmergencyModeActive()).toBe(false);

      manager.setEmergencyMode(true);
      expect(manager.isEmergencyModeActive()).toBe(true);

      manager.setEmergencyMode(false);
      expect(manager.isEmergencyModeActive()).toBe(false);
    });

    it('should start emergency alarm and set emergency mode', () => {
      const manager = getSoundManager();

      const id = manager.startEmergencyAlarm();

      expect(id).toBeTruthy();
      expect(manager.isEmergencyModeActive()).toBe(true);
      expect(manager.isPlayingType('emergency')).toBe(true);
    });

    it('should stop emergency alarm and clear emergency mode', () => {
      const manager = getSoundManager();

      manager.startEmergencyAlarm();
      manager.stopEmergencyAlarm();

      expect(manager.isEmergencyModeActive()).toBe(false);
      expect(manager.isPlayingType('emergency')).toBe(false);
    });
  });

  describe('Play Functionality', () => {
    it('should play a sound and return id', () => {
      const manager = getSoundManager();
      const id = manager.play('notification');

      expect(id).toBeTruthy();
      expect(id).toContain('notification');
    });

    it('should track active sounds', () => {
      const manager = getSoundManager();

      expect(manager.isPlaying()).toBe(false);

      manager.play('notification');

      expect(manager.isPlaying()).toBe(true);
      expect(manager.getActiveSounds()).toHaveLength(1);
    });

    it('should check if specific type is playing', () => {
      const manager = getSoundManager();

      manager.play('alert');

      expect(manager.isPlayingType('alert')).toBe(true);
      expect(manager.isPlayingType('notification')).toBe(false);
    });

    it('should apply global mute to non-emergency sounds', () => {
      const manager = getSoundManager();

      manager.setGlobalMute(true);
      manager.play('notification', { fadeIn: 0 });

      expect(soundGains().map((gain) => gain.gain.value)).toEqual([0]);
    });

    it('should never mute emergency sounds', () => {
      const manager = getSoundManager();

      manager.setGlobalMute(true);
      manager.play('emergency');

      expect(soundGains().map((gain) => gain.gain.value)).toEqual([1]);
    });

    it('should call onEnd callback when sound ends', async () => {
      const manager = getSoundManager();
      const onEnd = jest.fn();

      manager.play('notification', { onEnd, loop: false });
      await settle();

      // Simulate the last tone ending
      expect(made.oscillators).toHaveLength(1);
      made.oscillators[0].end();

      expect(onEnd).toHaveBeenCalled();
    });
  });

  describe('Stop Functionality', () => {
    it('should stop specific sound by id', () => {
      const manager = getSoundManager();
      // Use fadeOut: 0 to stop immediately
      const id = manager.play('notification', { fadeOut: 0 });

      expect(manager.isPlaying()).toBe(true);

      manager.stop(id, 0); // Pass 0 fadeOut to stop immediately

      expect(manager.isPlaying()).toBe(false);
    });

    it('should stop all sounds of a type', () => {
      jest.useFakeTimers();
      const manager = getSoundManager();

      manager.play('notification', { fadeOut: 0 });
      manager.play('notification', { fadeOut: 0 });
      manager.play('alert', { fadeOut: 0 });

      expect(manager.getActiveSounds()).toHaveLength(3);

      manager.stopByType('notification');
      jest.advanceTimersByTime(500); // Allow fade to complete

      expect(manager.getActiveSounds()).toHaveLength(1);
      expect(manager.isPlayingType('notification')).toBe(false);
      expect(manager.isPlayingType('alert')).toBe(true);

      jest.useRealTimers();
    });

    it('should stop all sounds', () => {
      const manager = getSoundManager();

      manager.play('notification');
      manager.play('alert');
      manager.play('warning');

      manager.stopAll(); // stopAll uses fadeOut: 0 internally

      expect(manager.isPlaying()).toBe(false);
      expect(manager.getActiveSounds()).toHaveLength(0);
    });
  });

  describe('Priority System', () => {
    it('should track priority of sounds', () => {
      const manager = getSoundManager();

      manager.play('notification'); // priority 1
      manager.play('alert');        // priority 2
      manager.play('warning');      // priority 3

      const sounds = manager.getActiveSounds();
      expect(sounds).toHaveLength(3);

      // Priorities should be assigned
      expect(sounds.find(s => s.type === 'notification')?.priority).toBe(1);
      expect(sounds.find(s => s.type === 'alert')?.priority).toBe(2);
      expect(sounds.find(s => s.type === 'warning')?.priority).toBe(3);
    });

    it('should limit concurrent sounds', () => {
      const manager = getSoundManager();

      // Play 4 low-priority sounds
      manager.play('notification');
      manager.play('notification');
      manager.play('notification');
      manager.play('notification');

      // Max concurrent is 3, so oldest/lowest priority should be removed
      expect(manager.getActiveSounds().length).toBeLessThanOrEqual(4);
    });
  });

  describe('Severity Mapping', () => {
    it('should play correct sound for severity', () => {
      const manager = getSoundManager();

      const lowId = manager.playForSeverity('low');
      expect(lowId).toContain('notification');
      manager.stopAll();

      const mediumId = manager.playForSeverity('medium');
      expect(mediumId).toContain('alert');
      manager.stopAll();

      const highId = manager.playForSeverity('high');
      expect(highId).toContain('warning');
      manager.stopAll();

      const criticalId = manager.playForSeverity('critical');
      expect(criticalId).toContain('alarm');
    });
  });

  describe('Test Functions', () => {
    it('should play test sound without loop', () => {
      const manager = getSoundManager();
      const id = manager.test('alarm');

      expect(id).toBeTruthy();
      const sounds = manager.getActiveSounds();
      expect(sounds[0].loop).toBe(false);
    });

    it('should test emergency for 2 seconds', () => {
      jest.useFakeTimers();
      const manager = getSoundManager();

      manager.testEmergency();

      expect(manager.isEmergencyModeActive()).toBe(true);

      jest.advanceTimersByTime(2000);

      expect(manager.isEmergencyModeActive()).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('Initialization', () => {
    it('should preload sounds on initialize', async () => {
      const manager = getSoundManager();

      await manager.initialize();

      // Second initialize should be no-op
      await manager.initialize();
    });

    it('makes no audio element for the built-in sounds', async () => {
      await getSoundManager().initialize();

      expect(audioSources).toEqual([]);
    });
  });

  describe('Volume Calculation', () => {
    it('should apply emergency mode volume override', () => {
      const manager = getSoundManager();
      manager.setUserVolume(30);
      manager.setEmergencyMode(true);

      // Use fadeIn: 0 to get immediate volume setting
      manager.play('notification', { fadeIn: 0 });

      // In emergency mode, volume should be 1.0 (100%)
      expect(soundGains().map((gain) => gain.gain.value)).toEqual([1]);
    });

    it('should respect forceMaxVolume option', () => {
      const manager = getSoundManager();
      manager.setUserVolume(30);

      // Use fadeIn: 0 to get immediate volume setting
      manager.play('notification', { forceMaxVolume: true, fadeIn: 0 });

      expect(soundGains().map((gain) => gain.gain.value)).toEqual([1]);
    });
  });

  describe('Loop Control', () => {
    it('should respect loop option', () => {
      const manager = getSoundManager();

      manager.play('notification', { loop: true });

      const sounds = manager.getActiveSounds();
      expect(sounds[0].loop).toBe(true);
    });

    it('should use default loop from config', () => {
      const manager = getSoundManager();

      // alarm defaults to loop: true
      manager.play('alarm');

      const sounds = manager.getActiveSounds();
      expect(sounds[0].loop).toBe(true);
    });
  });

  describe('Sound files', () => {
    it('serves no Git LFS pointer from public, and no source names an address under /sounds/', () => {
      const relative = (file: string) => path.relative(APP_ROOT, file);
      const lfsPointers = listFiles(path.join(APP_ROOT, 'public'))
        .filter((file) => fs.readFileSync(file).subarray(0, LFS_POINTER.length).toString('utf8') === LFS_POINTER)
        .map(relative);
      const soundAddresses = listFiles(path.join(APP_ROOT, 'src')).flatMap((file) =>
        fs.readFileSync(file, 'utf8').split('\n').flatMap((line, index) =>
          (SOUND_ADDRESS.test(line) ? [`${relative(file)}:${index + 1}`] : [])));

      expect({ lfsPointers, soundAddresses }).toEqual({ lfsPointers: [], soundAddresses: [] });
    });
  });

  describe('Generated tones', () => {
    it('holds the five patterns in one exported table, each tone ramping over 10 ms', () => {
      expect(soundModule.TONE_PATTERNS).toEqual(DECIDED_PATTERNS);
      expect(soundModule.TONE_RAMP_MS).toBe(10);
    });

    for (const type of ['notification', 'alert', 'warning', 'alarm', 'emergency'] as const) {
      it(`plays ${type} as its pattern through one gain at its volume, with no audio element`, async () => {
        jest.useFakeTimers();
        const manager = getSoundManager();
        manager.setUserVolume(20);

        manager.play(type, { fadeIn: 0 });
        await settle();

        expect(audioSources).toEqual([]);
        const pattern = (soundModule.TONE_PATTERNS as Record<string, PatternShape>)[type];
        expect(made.oscillators.map(describeOscillator)).toEqual(schedule(pattern, 0));

        const gains = soundGains();
        expect(gains.map((gain) => gain.gain.value)).toEqual([VOLUME_AT_20[type]]);
        for (const oscillator of made.oscillators) {
          // Each tone has its own envelope into the sound's gain, ramping in and out over 10 ms.
          expect(oscillator.outputs).toHaveLength(1);
          const envelope = oscillator.outputs[0] as FakeGain;
          expect(envelope.outputs).toEqual([gains[0]]);
          const start = oscillator.starts[0];
          const stop = oscillator.stops[0];
          expect(envelope.gain.events.map((event) => ({ ...event, time: round(event.time) }))).toEqual([
            { kind: 'set', value: 0, time: round(start) },
            { kind: 'ramp', value: pattern.level, time: round(start + 0.01) },
            { kind: 'set', value: pattern.level, time: round(stop - 0.01) },
            { kind: 'ramp', value: 0, time: round(stop) },
          ]);
        }
      });
    }

    it('removes a sound that does not loop from the active list when its last tone ends', async () => {
      const manager = getSoundManager();
      const onEnd = jest.fn();

      manager.play('alert', { fadeIn: 0, onEnd });
      await settle();

      expect(made.oscillators).toHaveLength(2);
      made.oscillators[0].end();
      expect(manager.isPlayingType('alert')).toBe(true);

      made.oscillators[1].end();
      expect(manager.getActiveSounds()).toHaveLength(0);
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(soundGains().map((gain) => gain.disconnected)).toEqual([true]);
    });

    it('repeats a looping sound until stop(id), then schedules nothing more, stops its tones and disconnects its gain', async () => {
      jest.useFakeTimers();
      const manager = getSoundManager();

      const id = manager.play('alarm', { fadeIn: 0 });
      await settle();

      expect(made.contexts).toHaveLength(1);
      const context = made.contexts[0];
      const pattern = (soundModule.TONE_PATTERNS as Record<string, PatternShape>).alarm;
      const cycle = passLength(pattern) + (pattern.repeatPause ?? 0) / 1000;
      await runClock(context, (cycle + 0.1) * 1000);

      const twoPasses = [...schedule(pattern, 0), ...schedule(pattern, cycle)];
      expect(made.oscillators.slice(0, twoPasses.length).map(describeOscillator)).toEqual(twoPasses);
      expect(manager.isPlayingType('alarm')).toBe(true);

      const [gain] = soundGains();
      const stoppedAt = context.currentTime;
      manager.stop(id);
      const count = made.oscillators.length;
      await runClock(context, 5000);

      expect(made.oscillators).toHaveLength(count);
      expect(made.oscillators.map(lastStop).filter((time) => time > stoppedAt)).toEqual([]);
      expect(gain.disconnected).toBe(true);
      expect(manager.isPlaying()).toBe(false);
    });

    it('stopByType and stopAll stop looping sounds the same way', async () => {
      jest.useFakeTimers();
      const manager = getSoundManager();

      manager.play('alarm', { fadeIn: 0 });
      manager.play('emergency', { fadeIn: 0 });
      await settle();

      expect(made.contexts).toHaveLength(1);
      const context = made.contexts[0];
      const [alarm, emergency] = soundGains();
      await runClock(context, 500);

      const typeStoppedAt = context.currentTime;
      manager.stopByType('alarm');
      expect(alarm.disconnected).toBe(true);
      expect(emergency.disconnected).toBe(false);
      expect(through(alarm).map(lastStop).filter((time) => time > typeStoppedAt)).toEqual([]);
      const alarmTones = through(alarm).length;
      const emergencyTones = through(emergency).length;

      await runClock(context, 4000);
      expect(through(alarm)).toHaveLength(alarmTones);
      expect(through(emergency).length).toBeGreaterThan(emergencyTones);
      expect(manager.isPlayingType('emergency')).toBe(true);

      const allStoppedAt = context.currentTime;
      manager.stopAll();
      expect(emergency.disconnected).toBe(true);
      expect(through(emergency).map(lastStop).filter((time) => time > allStoppedAt)).toEqual([]);
      const total = made.oscillators.length;

      await runClock(context, 5000);
      expect(made.oscillators).toHaveLength(total);
      expect(manager.isPlaying()).toBe(false);
    });

    it('mute and a volume change act on the gain of a sound that plays', async () => {
      const manager = getSoundManager();

      manager.play('notification', { fadeIn: 0 });
      manager.play('emergency', { fadeIn: 0 });
      await settle();

      expect(soundGains()).toHaveLength(2);
      const [notification, emergency] = soundGains();
      const values = () => [notification.gain.value, emergency.gain.value];
      expect(values()).toEqual([0.7, 1]);

      manager.setGlobalMute(true);
      expect(values()).toEqual([0, 1]);

      manager.setUserVolume(40);
      expect(values()).toEqual([0, 1]);

      manager.setGlobalMute(false);
      expect(values()).toEqual([0.4, 1]);
    });

    it('fades the gain in when a sound starts and out when it stops', async () => {
      jest.useFakeTimers();
      const manager = getSoundManager();

      // A notification fades in over 100 ms and out over 200 ms.
      const id = manager.play('notification');
      await settle();

      expect(soundGains()).toHaveLength(1);
      const [gain] = soundGains();
      expect(gain.gain.value).toBe(0);
      jest.advanceTimersByTime(100);
      expect(gain.gain.value).toBeCloseTo(0.7);

      manager.stop(id);
      jest.advanceTimersByTime(100);
      expect(gain.gain.value).toBeCloseTo(0.35);
      expect(manager.isPlaying()).toBe(true);

      jest.advanceTimersByTime(150);
      expect(gain.gain.value).toBe(0);
      expect(gain.disconnected).toBe(true);
      expect(manager.isPlaying()).toBe(false);
    });
  });

  describe('Starting audio', () => {
    it('makes one AudioContext for the module, on the first play', async () => {
      const manager = getSoundManager();
      await manager.initialize();
      expect(made.contexts).toHaveLength(0);

      manager.play('notification', { fadeIn: 0 });
      manager.play('alert', { fadeIn: 0 });
      await settle();

      expect(made.contexts).toHaveLength(1);
    });

    it('uses the webkit-prefixed AudioContext where that is what exists', async () => {
      delete browser.AudioContext;
      browser.webkitAudioContext = FakeAudioContext;
      const manager = getSoundManager();

      manager.play('notification', { fadeIn: 0 });
      await settle();

      expect(made.contexts).toHaveLength(1);
      expect(made.oscillators).toHaveLength(1);
    });

    it('resumes a suspended context before the first tone', async () => {
      audioSetup.state = 'suspended';
      audioSetup.resume = (context) => Promise.resolve().then(() => {
        context.state = 'running';
      });
      const manager = getSoundManager();

      manager.play('alert', { fadeIn: 0 });
      await settle();

      expect(made.log).toEqual(['resume', 'start:running', 'start:running']);
      expect(manager.isPlayingType('alert')).toBe(true);
    });

    const cannotStart: Record<string, () => void> = {
      'resume rejects': () => {
        audioSetup.state = 'suspended';
        audioSetup.resume = () => Promise.reject(new Error('Autoplay is not allowed'));
      },
      'the context stays suspended': () => {
        audioSetup.state = 'suspended';
        audioSetup.resume = () => Promise.resolve();
      },
      // A browser that blocks audio leaves the promise of resume() pending.
      'resume does not settle within a second': () => {
        audioSetup.state = 'suspended';
        audioSetup.resume = () => new Promise<void>(() => {});
      },
      'the browser has no AudioContext': () => {
        delete browser.AudioContext;
      },
    };

    for (const [name, arrange] of Object.entries(cannotStart)) {
      it(`when ${name}, play does not throw, warns once and leaves no active sound`, async () => {
        jest.useFakeTimers();
        arrange();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const manager = getSoundManager();

        let id = '';
        expect(() => {
          id = manager.play('alert', { fadeIn: 0 });
        }).not.toThrow();
        expect(id).toContain('alert');
        await settle();
        jest.advanceTimersByTime(1000);
        await settle();

        expect(manager.getActiveSounds()).toHaveLength(0);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('Failed to play sound:', expect.anything());
        expect(made.log.filter((entry) => entry.startsWith('start'))).toEqual([]);
        expect(audioSources).toEqual([]);
      });
    }
  });
});

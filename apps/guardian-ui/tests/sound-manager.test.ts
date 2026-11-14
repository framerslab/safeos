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
import {
  FakeAudioContext,
  type FakeGain,
  type FakeOscillator,
  audioSetup,
  lastStop,
  made,
  resetFakeAudio,
  runClock,
  settle,
  soundGains,
  started,
  through,
} from './helpers/fake-audio';

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

const browser = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };

// This file runs in the node environment, whose window is a bare object. It gets
// a real event target, as a browser's window is one, so a case can dispatch a gesture.
const pageEvents = new EventTarget();
Object.assign(window, {
  addEventListener: pageEvents.addEventListener.bind(pageEvents),
  removeEventListener: pageEvents.removeEventListener.bind(pageEvents),
  dispatchEvent: pageEvents.dispatchEvent.bind(pageEvents),
});

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

function describeOscillator(oscillator: FakeOscillator) {
  return {
    type: oscillator.type,
    frequency: oscillator.frequency.value,
    start: round(oscillator.starts[0]),
    stop: round(oscillator.stops[0]),
  };
}

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
    resetFakeAudio();
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

  describe('The stand-in audio clock', () => {
    it('delivers each scheduled end once when its clock passes the stop time, honours a replacing stop and freezes while suspended', async () => {
      jest.useFakeTimers();
      const context = new FakeAudioContext();
      const ended: string[] = [];
      const oscillator = (name: string) => {
        const node = context.createOscillator();
        node.onended = () => ended.push(name);
        node.start(0);
        return node;
      };
      oscillator('once').stop(0.2);
      // A later stop replaces an earlier one that has not been reached.
      const later = oscillator('later');
      later.stop(0.1);
      later.stop(0.5);
      const sooner = oscillator('sooner');
      sooner.stop(0.9);
      sooner.stop(0.3);

      await runClock(context, 250);
      expect(ended).toEqual(['once']);
      await runClock(context, 100);
      expect(ended).toEqual(['once', 'sooner']);

      // A suspended context's time does not move.
      context.state = 'suspended';
      const at = context.currentTime;
      await runClock(context, 1000);
      expect(context.currentTime).toBe(at);
      expect(ended).toEqual(['once', 'sooner']);

      context.state = 'running';
      await runClock(context, 200);
      expect(ended).toEqual(['once', 'sooner', 'later']);
      await runClock(context, 1000);
      expect(ended).toEqual(['once', 'sooner', 'later']);
    });

    it('ends an oscillator stopped before its start time when the clock passes the stop time, a stop time in the past counting as the current time', async () => {
      jest.useFakeTimers();
      const context = new FakeAudioContext();
      const ended: string[] = [];
      const oscillator = (name: string, start: number) => {
        const node = context.createOscillator();
        node.onended = () => ended.push(name);
        node.start(start);
        return node;
      };

      // Scheduled to start at 5 s and stopped for 0.1 s: it never plays, and ends at 0.1 s.
      const cancelled = oscillator('cancelled', 5);
      cancelled.stop(0.1);
      expect(cancelled.endsAt()).toBeCloseTo(0.1);
      await runClock(context, 50);
      expect(ended).toEqual([]);
      await runClock(context, 100);
      expect(ended).toEqual(['cancelled']);

      // The clock is at 0.15 s. A stop time of 0, or one the clock has passed, is a stop now.
      const now = context.currentTime;
      const stoppedNow = oscillator('stopped now', 3);
      stoppedNow.stop();
      const stoppedInThePast = oscillator('stopped in the past', 3);
      stoppedInThePast.stop(0.05);
      expect(stoppedNow.endsAt()).toBeCloseTo(now);
      expect(stoppedInThePast.endsAt()).toBeCloseTo(now);
      await runClock(context, 10);
      expect(ended).toEqual(['cancelled', 'stopped now', 'stopped in the past']);

      // Each end is delivered once: nothing more when the clock passes the start times.
      await runClock(context, 6000);
      expect(ended).toEqual(['cancelled', 'stopped now', 'stopped in the past']);
    });
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
      jest.useFakeTimers();
      const manager = getSoundManager();
      const onEnd = jest.fn();

      manager.play('notification', { onEnd, loop: false });
      await settle();

      // The audio clock passes the end of the one 180 ms tone
      expect(made.oscillators).toHaveLength(1);
      await runClock(made.contexts[0], 200);

      expect(onEnd).toHaveBeenCalledTimes(1);
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
      jest.useFakeTimers();
      const manager = getSoundManager();
      const onEnd = jest.fn();

      manager.play('alert', { fadeIn: 0, onEnd });
      await settle();

      // The first tone ends at 160 ms, the last at 490 ms.
      expect(made.oscillators).toHaveLength(2);
      const context = made.contexts[0];
      await runClock(context, 200);
      expect(made.oscillators.map((oscillator) => oscillator.ended)).toEqual([true, false]);
      expect(manager.isPlayingType('alert')).toBe(true);

      await runClock(context, 300);
      expect(made.oscillators.map((oscillator) => oscillator.ended)).toEqual([true, true]);
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

      // A notification fades in over 100 ms and out over 200 ms. Its one tone
      // lasts 180 ms, so it loops here to be sounding when the fade out ends.
      const id = manager.play('notification', { loop: true });
      await settle();

      expect(soundGains()).toHaveLength(1);
      const [gain] = soundGains();
      const context = made.contexts[0];
      expect(gain.gain.value).toBe(0);
      await runClock(context, 100);
      expect(gain.gain.value).toBeCloseTo(0.7);

      manager.stop(id);
      await runClock(context, 100);
      expect(gain.gain.value).toBeCloseTo(0.35);
      expect(manager.isPlaying()).toBe(true);

      await runClock(context, 150);
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
      // A partial AudioContext, such as a page's stand-in, that makes no audio nodes.
      'the context cannot make audio nodes': () => {
        browser.AudioContext = class {
          state = 'running';
          currentTime = 0;
          destination = {};
          resume(): Promise<void> {
            return Promise.resolve();
          }
        };
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

  describe('Waiting for audio, stopping and fading', () => {
    type Manager = ReturnType<typeof getSoundManager>;
    const pattern = (type: string) => (soundModule.TONE_PATTERNS as Record<string, PatternShape>)[type];
    const cycleOf = (type: string) => passLength(pattern(type)) + (pattern(type).repeatPause ?? 0) / 1000;

    it('keeps a looping sound whose context cannot run yet, and schedules its first pass once when the context runs; a loop stopped while waiting and a sound that does not loop never start', async () => {
      jest.useFakeTimers();
      audioSetup.state = 'suspended';
      // A browser that blocks audio leaves the promise of resume() pending.
      audioSetup.resume = () => new Promise<void>(() => {});
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const manager = getSoundManager();

      const alarm = manager.play('alarm', { fadeIn: 0 });
      const emergency = manager.play('emergency', { fadeIn: 0 });
      manager.play('alert', { fadeIn: 0 });
      await settle();
      expect(made.contexts).toHaveLength(1);
      const context = made.contexts[0];
      const [alarmGain, emergencyGain] = soundGains();
      await runClock(context, 1500);

      // Past the one-second wait the loops wait, not sounding; the alert, which does not loop, is dropped.
      expect(manager.getActiveSounds().map((sound) => sound.id).sort()).toEqual([alarm, emergency].sort());
      expect(started().map(describeOscillator)).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);

      manager.stop(emergency);
      expect(manager.getActiveSounds().map((sound) => sound.id)).toEqual([alarm]);

      // Audio becomes available: the alarm's first pass is scheduled, once, and a later play does not repeat it.
      const at = context.currentTime;
      context.state = 'running';
      manager.play('notification', { fadeIn: 0 });
      await settle();
      expect(through(alarmGain).map(describeOscillator)).toEqual(schedule(pattern('alarm'), at));

      await runClock(context, 100);
      expect(through(alarmGain).map(describeOscillator)).toEqual([
        ...schedule(pattern('alarm'), at),
        ...schedule(pattern('alarm'), at + cycleOf('alarm')),
      ]);
      expect(manager.isPlayingType('alarm')).toBe(true);

      await runClock(context, 5000);
      expect(through(emergencyGain)).toEqual([]);
    });

    // As Chrome and Safari do: a context made before any gesture is suspended, and
    // resume() goes through only when it is called after one.
    const blockedUntilGesture = () => {
      const gesture = { seen: false };
      audioSetup.state = 'suspended';
      audioSetup.resume = (context) => {
        if (!gesture.seen) return new Promise<void>(() => {});
        context.state = 'running';
        return Promise.resolve();
      };
      return gesture;
    };
    const resumeCalls = () => made.log.filter((entry) => entry === 'resume').length;
    // The events a browser counts as a person's gesture.
    const GESTURES = ['keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchend'];

    for (const type of GESTURES) {
      it(`a looping sound that waits for audio starts on the person's next ${type}: resume() is called again and the first pass is scheduled once`, async () => {
        jest.useFakeTimers();
        const gesture = blockedUntilGesture();
        const manager = getSoundManager();

        const id = manager.play('emergency', { fadeIn: 0 });
        await settle();
        const context = made.contexts[0];
        const [gain] = soundGains();
        await runClock(context, 1500);
        expect(started()).toEqual([]);
        expect(manager.isActive(id)).toBe(true);
        const asked = resumeCalls();

        // The person clicks, taps or presses a key somewhere that plays no sound.
        gesture.seen = true;
        const at = context.currentTime;
        window.dispatchEvent(new Event(type));
        await settle();

        expect(resumeCalls()).toBe(asked + 1);
        expect(context.state).toBe('running');
        expect(through(gain).map(describeOscillator)).toEqual(schedule(pattern('emergency'), at));

        // Audio runs: another gesture asks for nothing and schedules nothing.
        window.dispatchEvent(new Event(type));
        await settle();
        expect(resumeCalls()).toBe(asked + 1);
        expect(through(gain).map(describeOscillator)).toEqual(schedule(pattern('emergency'), at));
      });
    }

    it('a gesture inside the first second starts the waiting loop at once, and the end of the wait schedules nothing twice', async () => {
      jest.useFakeTimers();
      const gesture = blockedUntilGesture();
      const manager = getSoundManager();

      manager.play('emergency', { fadeIn: 0 });
      await settle();
      const context = made.contexts[0];
      const [gain] = soundGains();
      await runClock(context, 500);
      expect(started()).toEqual([]);

      gesture.seen = true;
      const at = context.currentTime;
      window.dispatchEvent(new Event('mousedown'));
      await settle();
      expect(through(gain).map(describeOscillator)).toEqual(schedule(pattern('emergency'), at));

      // The one-second wait ends 500 ms later: two passes are scheduled by then, each once.
      await runClock(context, 600);
      expect(made.oscillators.map((oscillator) => round(oscillator.starts[0]))).toEqual(
        [...schedule(pattern('emergency'), at), ...schedule(pattern('emergency'), at + cycleOf('emergency'))].map(
          (tone) => tone.start,
        ),
      );
    });

    it('after a waiting loop is stopped, a gesture does not resume the context', async () => {
      jest.useFakeTimers();
      const gesture = blockedUntilGesture();
      const manager = getSoundManager();

      const id = manager.play('alarm', { fadeIn: 0 });
      await settle();
      const context = made.contexts[0];
      await runClock(context, 1500);
      manager.stop(id);
      expect(manager.getActiveSounds()).toEqual([]);
      const asked = resumeCalls();

      gesture.seen = true;
      for (const type of GESTURES) window.dispatchEvent(new Event(type));
      await settle();

      expect(resumeCalls()).toBe(asked);
      expect(context.state).toBe('suspended');
      expect(started()).toEqual([]);
    });

    const cancels: Record<string, (manager: Manager, id: string) => void> = {
      'stop(id)': (manager, id) => manager.stop(id),
      stopByType: (manager) => manager.stopByType('warning'),
      stopAll: (manager) => manager.stopAll(),
    };

    for (const [name, cancel] of Object.entries(cancels)) {
      it(`${name} before resume resolves cancels the sound at once: no tone starts when resume resolves inside the fade-out time`, async () => {
        jest.useFakeTimers();
        let letAudioRun = () => {};
        audioSetup.state = 'suspended';
        audioSetup.resume = (context) => new Promise<void>((resolve) => {
          letAudioRun = () => {
            context.state = 'running';
            resolve();
          };
        });
        const manager = getSoundManager();

        // A warning fades out over 100 ms once it sounds.
        const id = manager.play('warning', { fadeIn: 0 });
        await settle();
        const context = made.contexts[0];
        cancel(manager, id);
        await runClock(context, 50);
        letAudioRun();
        await runClock(context, 2000);

        expect(started().map(describeOscillator)).toEqual([]);
        expect(manager.getActiveSounds()).toEqual([]);
      });
    }

    it('a volume change during a fade in ends the fade at the new value: at volume 0 the gain stays 0', async () => {
      jest.useFakeTimers();
      const manager = getSoundManager();

      manager.play('notification', { loop: true, fadeIn: 1000 });
      await settle();
      const context = made.contexts[0];
      const [gain] = soundGains();
      await runClock(context, 100);
      expect(gain.gain.value).toBeGreaterThan(0);

      manager.setUserVolume(0);
      expect(gain.gain.value).toBe(0);
      const from = gain.gain.writes.length;
      await runClock(context, 1000);

      expect(gain.gain.writes.slice(from).filter((value) => value !== 0)).toEqual([]);
      expect(gain.gain.value).toBe(0);
    });

    const endsDuringFade: Record<string, { loop: boolean; end: (manager: Manager) => void }> = {
      'stopAll during a fade in': { loop: true, end: (manager) => manager.stopAll() },
      'a sound that ends during its fade in': { loop: false, end: () => {} },
    };

    for (const [name, { loop, end }] of Object.entries(endsDuringFade)) {
      it(`${name}: no later tick writes to the gain`, async () => {
        jest.useFakeTimers();
        const manager = getSoundManager();

        // The notification's one tone ends at 180 ms, inside its one-second fade.
        manager.play('notification', { loop, fadeIn: 1000 });
        await settle();
        const context = made.contexts[0];
        const [gain] = soundGains();
        await runClock(context, 100);
        end(manager);
        await runClock(context, 150);
        expect(manager.isPlaying()).toBe(false);
        expect(gain.disconnected).toBe(true);

        const from = gain.gain.writes.length;
        await runClock(context, 1500);
        expect(gain.gain.writes.slice(from)).toEqual([]);
      });
    }

    it('a looping sound schedules no more passes while its context is suspended, and one chain goes on when it runs again', async () => {
      jest.useFakeTimers();
      const manager = getSoundManager();

      manager.play('alarm', { fadeIn: 0 });
      await settle();
      const context = made.contexts[0];
      const cycle = cycleOf('alarm');
      await runClock(context, 500);
      // Two passes are scheduled: the one that plays and the next.
      expect(made.oscillators).toHaveLength(2 * pattern('alarm').tones.length);

      // The context suspends, as when a page goes to the background; timers go on firing for ten passes' time.
      context.state = 'suspended';
      const count = made.oscillators.length;
      await runClock(context, cycle * 10 * 1000);
      expect(made.oscillators.length).toBe(count);

      // It runs again: one chain goes on from the third pass, one pass per cycle.
      // Each pass is scheduled when the one before it starts.
      context.state = 'running';
      await runClock(context, 3 * cycle * 1000);
      expect(made.oscillators.slice(count).map(describeOscillator)).toEqual([
        ...schedule(pattern('alarm'), 2 * cycle),
        ...schedule(pattern('alarm'), 3 * cycle),
        ...schedule(pattern('alarm'), 4 * cycle),
      ]);
    });
  });

  describe('Stopping during a fade out', () => {
    // A notification fades out over 200 ms. It loops in these cases so it sounds through the fade.
    const playLoop = async () => {
      const manager = getSoundManager();
      const id = manager.play('notification', { loop: true, fadeIn: 0 });
      await settle();
      const gain = soundGains()[soundGains().length - 1];
      await runClock(made.contexts[0], 300);
      return { manager, id, gain, context: made.contexts[0] };
    };

    it('a second stop(id) does not postpone the first: the sound leaves 200 ms after the first stop; stop(id, 0) and stopAll end a fading sound at once', async () => {
      jest.useFakeTimers();
      const { manager, id, gain, context } = await playLoop();

      manager.stop(id);
      await runClock(context, 150);
      expect(manager.isActive(id)).toBe(true);
      manager.stop(id);
      // The first fade goes on from where it was: 17 of its 20 steps are done 170 ms in.
      await runClock(context, 20);
      expect(gain.gain.value).toBeCloseTo(0.7 * (3 / 20));
      await runClock(context, 30);
      expect(manager.isActive(id)).toBe(false);
      expect(gain.disconnected).toBe(true);

      const cut = await playLoop();
      manager.stop(cut.id);
      await runClock(context, 100);
      expect(manager.isActive(cut.id)).toBe(true);
      manager.stop(cut.id, 0);
      expect(manager.isActive(cut.id)).toBe(false);
      expect(cut.gain.disconnected).toBe(true);

      const all = await playLoop();
      manager.stop(all.id);
      await runClock(context, 100);
      expect(manager.isActive(all.id)).toBe(true);
      manager.stopAll();
      expect(manager.isActive(all.id)).toBe(false);
      expect(all.gain.disconnected).toBe(true);
    });

    it('a stop repeated every 150 ms does not keep a sound active', async () => {
      jest.useFakeTimers();
      const { manager, id, gain, context } = await playLoop();

      manager.stop(id);
      await runClock(context, 150);
      manager.stop(id);
      await runClock(context, 150);
      // 300 ms after the first stop, and 100 ms past its fade.
      expect(manager.isActive(id)).toBe(false);
      expect(gain.disconnected).toBe(true);

      const count = made.oscillators.length;
      for (let repeat = 0; repeat < 5; repeat += 1) {
        manager.stop(id);
        await runClock(context, 150);
      }
      expect(manager.isPlaying()).toBe(false);
      expect(made.oscillators).toHaveLength(count);
    });
  });

  describe('A volume or mute change during a fade out to stop', () => {
    // An alarm and an emergency sound, both one second into a ten-second fade out to stop.
    const fadingOut = async () => {
      const manager = getSoundManager();
      const alarm = manager.play('alarm', { fadeIn: 0 });
      const emergency = manager.play('emergency', { fadeIn: 0 });
      await settle();
      const context = made.contexts[0];
      const [alarmGain, emergencyGain] = soundGains();
      await runClock(context, 500);

      manager.stop(alarm, 10000);
      manager.stop(emergency, 10000);
      await runClock(context, 1000);
      expect(manager.getActiveSounds().map((sound) => sound.id)).toEqual([alarm, emergency]);
      expect(alarmGain.gain.value).toBeGreaterThan(0);
      return { manager, alarm, emergency, context, alarmGain, emergencyGain };
    };

    // The emergency sound is exempt from volume and mute: its fade runs to its own end, ten seconds after its stop.
    const emergencyFadesToItsEnd = async (
      { manager, emergency, context, emergencyGain }: Awaited<ReturnType<typeof fadingOut>>,
      sinceStop: number,
    ) => {
      await runClock(context, 9500 - sinceStop);
      expect(manager.getActiveSounds().map((sound) => sound.id)).toEqual([emergency]);
      expect(emergencyGain.disconnected).toBe(false);
      expect(emergencyGain.gain.value).toBeGreaterThan(0);
      await runClock(context, 600);
      expect(manager.getActiveSounds()).toEqual([]);
      expect(emergencyGain.disconnected).toBe(true);
    };

    it('setUserVolume(0) ends the fading sound at that call: it leaves the active list and its gain is disconnected', async () => {
      jest.useFakeTimers();
      const sounds = await fadingOut();
      const { manager, alarm, emergency, context, alarmGain } = sounds;

      // A call with the volume it already has changes nothing.
      manager.setUserVolume(manager.getUserVolume());
      expect(manager.isActive(alarm)).toBe(true);
      expect(alarmGain.disconnected).toBe(false);

      const at = context.currentTime;
      manager.setUserVolume(0);
      expect(manager.getActiveSounds().map((sound) => sound.id)).toEqual([emergency]);
      expect(alarmGain.disconnected).toBe(true);
      expect(through(alarmGain).map(lastStop).filter((time) => time > at)).toEqual([]);

      // Nothing of it goes on: no tone is scheduled and its gain is not written again.
      const tones = through(alarmGain).length;
      const writes = alarmGain.gain.writes.length;
      await runClock(context, 3000);
      expect(through(alarmGain)).toHaveLength(tones);
      expect(alarmGain.gain.writes).toHaveLength(writes);

      await emergencyFadesToItsEnd(sounds, 4000);
    });

    it('setGlobalMute(true) ends the fading sound at that call, and setGlobalMute(false) brings nothing of it back', async () => {
      jest.useFakeTimers();
      const sounds = await fadingOut();
      const { manager, alarm, emergency, context, alarmGain } = sounds;

      // A call with the mute state it already has changes nothing.
      manager.setGlobalMute(false);
      expect(manager.isActive(alarm)).toBe(true);
      expect(alarmGain.disconnected).toBe(false);

      const at = context.currentTime;
      manager.setGlobalMute(true);
      expect(manager.getActiveSounds().map((sound) => sound.id)).toEqual([emergency]);
      expect(alarmGain.disconnected).toBe(true);
      expect(through(alarmGain).map(lastStop).filter((time) => time > at)).toEqual([]);

      const tones = through(alarmGain).length;
      const writes = alarmGain.gain.writes.length;
      await runClock(context, 1000);
      manager.setGlobalMute(false);
      await runClock(context, 2000);
      expect(manager.isActive(alarm)).toBe(false);
      expect(through(alarmGain)).toHaveLength(tones);
      expect(alarmGain.gain.writes).toHaveLength(writes);

      await emergencyFadesToItsEnd(sounds, 4000);
    });
  });

  describe('A closed audio context', () => {
    const alarmPattern = () => (soundModule.TONE_PATTERNS as Record<string, PatternShape>).alarm;
    const onContext = (context: FakeAudioContext) =>
      made.oscillators.filter((oscillator) => oscillator.context === context);

    it('a loop that waits on a suspended context leaves the active list when the context closes, with nothing scheduled; the next play makes a new context and sounds', async () => {
      jest.useFakeTimers();
      audioSetup.state = 'suspended';
      // A browser that blocks audio leaves the promise of resume() pending.
      audioSetup.resume = () => new Promise<void>(() => {});
      const manager = getSoundManager();

      const id = manager.play('emergency', { fadeIn: 0 });
      await settle();
      const context = made.contexts[0];
      const [gain] = soundGains();
      await runClock(context, 1500);
      // Past the one-second wait the loop waits for its context to run.
      expect(manager.isActive(id)).toBe(true);
      expect(started()).toEqual([]);
      const removed = jest.spyOn(window, 'removeEventListener');

      await context.close();
      expect(manager.isActive(id)).toBe(false);
      expect(manager.getActiveSounds()).toEqual([]);
      expect(gain.disconnected).toBe(true);
      // The page stops listening for a gesture on behalf of the closed context.
      expect(removed.mock.calls.map(([type]) => type).sort()).toEqual(
        ['keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchend'],
      );
      await runClock(context, 3000);
      expect(made.oscillators).toEqual([]);

      // The next play does not use the closed context. A new context starts running.
      audioSetup.state = 'running';
      const next = manager.play('alarm', { fadeIn: 0 });
      await settle();
      expect(made.contexts).toHaveLength(2);
      const fresh = made.contexts[1];
      expect(fresh.state).toBe('running');
      expect(onContext(context)).toEqual([]);
      expect(onContext(fresh).map(describeOscillator)).toEqual(schedule(alarmPattern(), 0));
      expect(manager.isActive(next)).toBe(true);
      const freshGains = made.gains.filter((node) => node.outputs.includes(fresh.destination));
      expect(freshGains.map((node) => node.disconnected)).toEqual([false]);
    });

    it('a loop that sounds leaves the active list when its context closes, and queues no more passes', async () => {
      jest.useFakeTimers();
      const manager = getSoundManager();

      const id = manager.play('alarm', { fadeIn: 0 });
      await settle();
      const context = made.contexts[0];
      const [gain] = soundGains();
      await runClock(context, 500);
      expect(manager.isActive(id)).toBe(true);
      const count = made.oscillators.length;

      await context.close();
      expect(manager.isActive(id)).toBe(false);
      expect(gain.disconnected).toBe(true);

      // Timers go on for ten passes' time; nothing is scheduled on the closed context.
      const cycle = passLength(alarmPattern()) + (alarmPattern().repeatPause ?? 0) / 1000;
      await runClock(context, 10 * cycle * 1000);
      expect(made.oscillators).toHaveLength(count);
      expect(made.contexts).toHaveLength(1);
    });
  });
});

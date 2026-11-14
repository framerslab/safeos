/**
 * Centralized Sound Manager
 *
 * Manages all audio playback with priority system and volume overrides.
 * Emergency mode always plays at 100% volume regardless of user settings.
 *
 * FEATURES:
 * - Built-in alert sounds (notification, alert, warning, alarm, emergency),
 *   generated as tones with the Web Audio API: no file, no connection needed
 * - Custom sound support via IndexedDB (see /settings/sounds)
 * - Priority-based playback (higher priority interrupts lower)
 * - Volume control with emergency override
 * - Loop and repeat functionality
 *
 * CUSTOM SOUNDS:
 * Custom sounds are stored in IndexedDB and can be triggered by detection events:
 * - person_detected: AI detected a person
 * - pet_detected: AI detected a pet (use for pet recall messages!)
 * - object_found: Lost & Found match detected
 * - motion_detected: Motion threshold exceeded
 * - audio_detected: Audio threshold exceeded
 * - inactivity_alert: No movement for specified time
 * - emergency: Emergency mode activated
 *
 * See /settings/sounds to upload, record, and configure custom sounds.
 */

import {
  getCustomSoundsByTrigger,
  recordSoundPlay,
  type CustomSound,
  type SoundTrigger,
} from './custom-sounds-db';

// =============================================================================
// Types
// =============================================================================

export type SoundType = 'notification' | 'alert' | 'warning' | 'alarm' | 'emergency';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

// Re-export trigger type for convenience
export type { SoundTrigger } from './custom-sounds-db';

export interface SoundConfig {
  type: SoundType;
  defaultVolume: number;   // 0-100
  priority: number;        // Higher = more important
  loop: boolean;
  fadeIn: number;          // ms (0 = instant)
  fadeOut: number;         // ms (0 = instant)
}

export interface PlayOptions {
  volume?: number;          // Override default volume (0-100)
  loop?: boolean;           // Override default loop
  fadeIn?: number;          // Override default fade
  fadeOut?: number;         // Override default fade
  onEnd?: () => void;       // Callback when sound ends
  forceMaxVolume?: boolean; // Ignore user volume, play at 100%
}

interface ActiveSound {
  id: string;
  type: SoundType;
  /** A custom sound plays through an audio element. */
  audio?: HTMLAudioElement;
  /** A built-in sound plays generated tones. */
  tones?: ToneVoice;
  priority: number;
  startTime: number;
  loop: boolean;
  onEnd?: () => void;
}

/** The tones of one built-in sound as it plays. */
interface ToneVoice {
  /** Carries the sound's volume; every tone plays through it. */
  gain: GainNode;
  /** Tones scheduled that have not ended. */
  oscillators: Set<OscillatorNode>;
  volume: number;          // 0-1, before mute
  muted: boolean;
  /** Queues the next pass of a looping sound. */
  timer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
}

// =============================================================================
// Generated Tones
// =============================================================================

export type ToneWave = 'sine' | 'triangle' | 'square';

export interface Tone {
  frequency: number;       // Hz
  duration: number;        // ms
  gapAfter: number;        // ms of silence after the tone
}

export interface TonePattern {
  tones: Tone[];
  wave: ToneWave;
  /** Peak of each tone before the volume is applied (1 = full scale). */
  level: number;
  /** Silence between repeats of a looping sound, in ms. */
  repeatPause?: number;
}

/** Every tone ramps in and out over this many ms, so it does not click. */
export const TONE_RAMP_MS = 10;

/** Silence between repeats, in ms, when a caller loops a sound that has no pause of its own. */
export const DEFAULT_REPEAT_PAUSE_MS = 400;

/** How long a play waits for a suspended context to resume, in ms. */
const RESUME_WAIT_MS = 1000;

/**
 * The five built-in sounds, generated with the Web Audio API. They need no
 * file and play with no connection.
 */
export const TONE_PATTERNS: Record<SoundType, TonePattern> = {
  notification: {
    wave: 'sine',
    level: 1,
    tones: [{ frequency: 880, duration: 180, gapAfter: 0 }],
  },
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

type AudioContextClass = new () => AudioContext;

// The module's one AudioContext, made on the first play.
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const Context: AudioContextClass | undefined = typeof window === 'undefined'
      ? undefined
      : window.AudioContext
        || (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
    if (!Context) {
      throw new Error('This browser has no AudioContext');
    }
    audioContext = new Context();
  }
  return audioContext;
}

// =============================================================================
// Sound Configurations
// =============================================================================

const SOUND_CONFIGS: Record<SoundType, SoundConfig> = {
  notification: {
    type: 'notification',
    defaultVolume: 60,
    priority: 1,
    loop: false,
    fadeIn: 100,
    fadeOut: 200,
  },
  alert: {
    type: 'alert',
    defaultVolume: 70,
    priority: 2,
    loop: false,
    fadeIn: 50,
    fadeOut: 150,
  },
  warning: {
    type: 'warning',
    defaultVolume: 80,
    priority: 3,
    loop: false,
    fadeIn: 0,
    fadeOut: 100,
  },
  alarm: {
    type: 'alarm',
    defaultVolume: 90,
    priority: 4,
    loop: true,
    fadeIn: 0,
    fadeOut: 0,
  },
  emergency: {
    type: 'emergency',
    defaultVolume: 100,
    priority: 5,
    loop: true,
    fadeIn: 0,
    fadeOut: 0,
  },
};

// Map severity to sound type
const SEVERITY_SOUND_MAP: Record<AlertSeverity, SoundType> = {
  low: 'notification',
  medium: 'alert',
  high: 'warning',
  critical: 'alarm',
};

// Volume multipliers based on severity (applied to user volume)
const SEVERITY_VOLUME_MULTIPLIER: Record<AlertSeverity, number> = {
  low: 0.6,
  medium: 0.7,
  high: 0.9,
  critical: 1.0,
};

// =============================================================================
// Sound Manager Class
// =============================================================================

class SoundManager {
  private activeSounds: Map<string, ActiveSound> = new Map();
  private userVolume: number = 70;  // 0-100, user preference
  private globalMute: boolean = false;
  private emergencyModeActive: boolean = false;
  private isInitialized: boolean = false;

  constructor() {
    // The audio context is made on the first play
  }

  /**
   * Initialize (call after user interaction). The built-in sounds are
   * generated when they play, so there is no file to load.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  /**
   * Set user volume preference (0-100)
   */
  setUserVolume(volume: number): void {
    this.userVolume = Math.max(0, Math.min(100, volume));

    // Update volume of currently playing sounds (except emergency)
    this.activeSounds.forEach((sound) => {
      if (sound.type !== 'emergency' && !this.emergencyModeActive) {
        this.setSoundVolume(sound, this.calculateVolume(sound.type));
      }
    });
  }

  /**
   * Get current user volume
   */
  getUserVolume(): number {
    return this.userVolume;
  }

  /**
   * Set global mute (does not affect emergency sounds)
   */
  setGlobalMute(muted: boolean): void {
    this.globalMute = muted;
    
    // Mute/unmute active sounds (except emergency)
    this.activeSounds.forEach((sound) => {
      if (sound.type !== 'emergency') {
        this.setSoundMuted(sound, muted);
      }
    });
  }

  /**
   * Get global mute state
   */
  isGlobalMuted(): boolean {
    return this.globalMute;
  }

  /**
   * Set emergency mode (overrides all volume to 100%)
   */
  setEmergencyMode(active: boolean): void {
    this.emergencyModeActive = active;
    
    if (active) {
      // Set all active sounds to max volume
      this.activeSounds.forEach((sound) => {
        this.setSoundVolume(sound, 1.0);
        this.setSoundMuted(sound, false);
      });
    } else {
      // Restore normal volumes
      this.activeSounds.forEach((sound) => {
        this.setSoundVolume(sound, this.calculateVolume(sound.type));
        if (this.globalMute && sound.type !== 'emergency') {
          this.setSoundMuted(sound, true);
        }
      });
    }
  }

  /**
   * Check if emergency mode is active
   */
  isEmergencyModeActive(): boolean {
    return this.emergencyModeActive;
  }

  /**
   * Play a sound by type
   */
  play(type: SoundType, options: PlayOptions = {}): string {
    const config = SOUND_CONFIGS[type];
    const id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let context: AudioContext;
    try {
      context = getAudioContext();
    } catch (error) {
      console.warn('Failed to play sound:', error);
      return id;
    }

    // Calculate volume
    let volume = this.calculateVolume(type, options.volume);
    if (options.forceMaxVolume || this.emergencyModeActive || type === 'emergency') {
      volume = 1.0;
    }

    // Set loop
    const loop = options.loop !== undefined ? options.loop : config.loop;

    // Apply mute (never mute emergency)
    const muted = this.globalMute && type !== 'emergency' && !this.emergencyModeActive;

    // Stop lower priority sounds if needed
    this.handlePriority(config.priority);

    // One gain node carries the sound's volume; its tones play through it
    const gain = context.createGain();
    gain.connect(context.destination);
    const tones: ToneVoice = { gain, oscillators: new Set(), volume, muted, timer: null, stopped: false };
    this.applyGain(tones);

    // Store active sound
    const activeSound: ActiveSound = {
      id,
      type,
      tones,
      priority: config.priority,
      startTime: Date.now(),
      loop,
      onEnd: options.onEnd,
    };
    this.activeSounds.set(id, activeSound);

    // Handle fade in
    const fadeIn = options.fadeIn !== undefined ? options.fadeIn : config.fadeIn;
    if (fadeIn > 0) {
      this.fadeVolume(activeSound, 0, volume, fadeIn);
    }

    // Play
    this.startTones(context, activeSound, TONE_PATTERNS[type]).catch((error) => {
      console.warn('Failed to play sound:', error);
      this.halt(activeSound);
      this.activeSounds.delete(id);
    });

    return id;
  }

  /**
   * Play sound based on alert severity
   */
  playForSeverity(severity: AlertSeverity, options: PlayOptions = {}): string {
    const type = SEVERITY_SOUND_MAP[severity];
    const volumeMultiplier = SEVERITY_VOLUME_MULTIPLIER[severity];
    
    return this.play(type, {
      ...options,
      volume: options.volume !== undefined 
        ? options.volume 
        : this.userVolume * volumeMultiplier,
    });
  }

  /**
   * Start emergency alarm (loops continuously)
   */
  startEmergencyAlarm(): string {
    this.setEmergencyMode(true);
    return this.play('emergency', {
      loop: true,
      forceMaxVolume: true,
    });
  }

  /**
   * Stop emergency alarm
   */
  stopEmergencyAlarm(): void {
    // Stop all emergency sounds
    this.activeSounds.forEach((sound, id) => {
      if (sound.type === 'emergency') {
        this.stop(id);
      }
    });
    this.setEmergencyMode(false);
  }

  /**
   * Stop a specific sound
   */
  stop(id: string, fadeOut?: number): void {
    const sound = this.activeSounds.get(id);
    if (!sound) return;

    const config = SOUND_CONFIGS[sound.type];
    const fade = fadeOut !== undefined ? fadeOut : config.fadeOut;

    if (fade > 0) {
      this.fadeVolume(sound, this.getSoundVolume(sound), 0, fade, () => {
        this.halt(sound);
        this.activeSounds.delete(id);
      });
    } else {
      this.halt(sound);
      this.activeSounds.delete(id);
    }
  }

  /**
   * Stop all sounds of a specific type
   */
  stopByType(type: SoundType): void {
    this.activeSounds.forEach((sound, id) => {
      if (sound.type === type) {
        this.stop(id);
      }
    });
  }

  /**
   * Stop all sounds
   */
  stopAll(): void {
    this.activeSounds.forEach((_, id) => {
      this.stop(id, 0);
    });
  }

  /**
   * Get all currently playing sounds
   */
  getActiveSounds(): ActiveSound[] {
    return Array.from(this.activeSounds.values());
  }

  /**
   * Check if any sound is currently playing
   */
  isPlaying(): boolean {
    return this.activeSounds.size > 0;
  }

  /**
   * Check if a specific type is playing
   */
  isPlayingType(type: SoundType): boolean {
    return Array.from(this.activeSounds.values()).some((s) => s.type === type);
  }

  /**
   * Test a specific sound (plays once at current volume)
   */
  test(type: SoundType): string {
    return this.play(type, {
      loop: false,
      fadeIn: 0,
      fadeOut: 200,
    });
  }

  /**
   * Test emergency mode (plays for 2 seconds then stops)
   */
  testEmergency(): void {
    const id = this.startEmergencyAlarm();
    setTimeout(() => {
      this.stopEmergencyAlarm();
    }, 2000);
  }

  // ==========================================================================
  // Custom Sound Methods
  // ==========================================================================

  /**
   * Play custom sounds for a specific trigger event
   *
   * Loads all enabled custom sounds configured for this trigger from IndexedDB
   * and plays them according to their individual settings (volume, loop, repeat).
   *
   * @param trigger - The event type that triggered this sound
   * @returns Array of sound IDs that were played
   *
   * @example
   * // When a pet is detected on camera:
   * await soundManager.playForTrigger('pet_detected');
   *
   * @example
   * // When a person is detected at night:
   * await soundManager.playForTrigger('person_detected');
   */
  async playForTrigger(trigger: SoundTrigger): Promise<string[]> {
    try {
      const customSounds = await getCustomSoundsByTrigger(trigger);

      if (customSounds.length === 0) {
        return [];
      }

      // Sort by priority (highest first)
      customSounds.sort((a, b) => b.priority - a.priority);

      const playedIds: string[] = [];

      for (const sound of customSounds) {
        const id = await this.playCustomSound(sound);
        if (id) {
          playedIds.push(id);
          // Record that we played this sound
          await recordSoundPlay(sound.id);
        }
      }

      return playedIds;
    } catch (error) {
      console.warn('Failed to play custom sounds for trigger:', trigger, error);
      return [];
    }
  }

  /**
   * Play a specific custom sound
   *
   * @param sound - The custom sound configuration from IndexedDB
   * @returns Sound ID or null if failed
   */
  async playCustomSound(sound: CustomSound): Promise<string | null> {
    try {
      const id = `custom-${sound.id}-${Date.now()}`;

      // Create audio from blob
      const url = URL.createObjectURL(sound.audioBlob);
      const audio = new Audio(url);

      // Calculate volume
      let volume = sound.volume / 100;
      if (this.emergencyModeActive) {
        volume = 1.0;
      }
      audio.volume = volume;

      // Apply mute (except emergency trigger)
      if (this.globalMute && !sound.triggers.includes('emergency')) {
        audio.muted = true;
      }

      // Handle priority - stop lower priority sounds
      this.handlePriority(sound.priority);

      // Track as active sound
      const activeSound: ActiveSound = {
        id,
        type: 'notification', // Map custom to notification for typing
        audio,
        priority: sound.priority,
        startTime: Date.now(),
        loop: sound.loop,
      };
      this.activeSounds.set(id, activeSound);

      // Handle repeats
      let repeatCount = 0;
      const maxRepeats = sound.loop ? Infinity : sound.repeatCount;

      const playOnce = () => {
        audio.currentTime = 0;
        audio.play().catch((err) => {
          console.warn('Failed to play custom sound:', err);
          URL.revokeObjectURL(url);
          this.activeSounds.delete(id);
        });
      };

      audio.addEventListener('ended', () => {
        if (sound.loop) {
          // Continuous loop
          audio.currentTime = 0;
          audio.play();
        } else if (repeatCount < maxRepeats) {
          // Repeat with delay
          repeatCount++;
          setTimeout(playOnce, sound.repeatDelayMs);
        } else {
          // Done playing
          URL.revokeObjectURL(url);
          this.activeSounds.delete(id);
        }
      });

      // Start playing
      playOnce();

      return id;
    } catch (error) {
      console.warn('Failed to play custom sound:', sound.name, error);
      return null;
    }
  }

  /**
   * Stop all custom sounds
   */
  stopCustomSounds(): void {
    this.activeSounds.forEach((sound, id) => {
      if (id.startsWith('custom-')) {
        this.stop(id, 0);
      }
    });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Calculate effective volume based on settings
   */
  private calculateVolume(type: SoundType, override?: number): number {
    if (this.emergencyModeActive) {
      return 1.0;
    }

    const config = SOUND_CONFIGS[type];
    const baseVolume = override !== undefined ? override : this.userVolume;

    // Emergency sound type always plays at max volume.
    if (config.priority === 5) {
      return 1.0;
    }

    // Respect explicit silence (quiet hours, user volume = 0, etc.)
    if (baseVolume <= 0) {
      return 0;
    }
    
    // Apply priority-based minimum volumes
    const minVolumes: Record<number, number> = {
      1: 0,     // notification - can be silent
      2: 0,     // alert - can be silent
      3: 30,    // warning - minimum 30%
      4: 50,    // alarm - minimum 50%
      5: 100,   // emergency - always 100% (handled above)
    };

    // If an explicit override is provided, treat it as authoritative (no min floor).
    if (override !== undefined) {
      return Math.max(0, Math.min(100, baseVolume)) / 100;
    }

    const minVolume = minVolumes[config.priority] || 0;
    const effectiveVolume = Math.max(baseVolume, minVolume);
    
    return effectiveVolume / 100;
  }

  /**
   * Handle priority - stop lower priority sounds if too many
   */
  private handlePriority(newPriority: number): void {
    const maxConcurrentSounds = 3;
    
    if (this.activeSounds.size >= maxConcurrentSounds) {
      // Find lowest priority sound to stop
      let lowestPriority = Infinity;
      let lowestId: string | null = null;
      
      this.activeSounds.forEach((sound, id) => {
        if (sound.priority < lowestPriority && sound.priority < newPriority) {
          lowestPriority = sound.priority;
          lowestId = id;
        }
      });
      
      if (lowestId) {
        this.stop(lowestId, 0);
      }
    }
  }

  /**
   * Fade volume smoothly
   */
  private fadeVolume(
    sound: ActiveSound,
    from: number,
    to: number,
    duration: number,
    onComplete?: () => void
  ): void {
    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = (to - from) / steps;
    let currentStep = 0;

    this.setSoundVolume(sound, from);

    const fade = setInterval(() => {
      currentStep++;
      this.setSoundVolume(sound, Math.max(0, Math.min(1, from + volumeStep * currentStep)));

      if (currentStep >= steps) {
        clearInterval(fade);
        this.setSoundVolume(sound, to);
        if (onComplete) {
          onComplete();
        }
      }
    }, stepDuration);
  }

  /**
   * Volume of an active sound (0-1), before mute
   */
  private getSoundVolume(sound: ActiveSound): number {
    if (sound.tones) return sound.tones.volume;
    return sound.audio ? sound.audio.volume : 0;
  }

  private setSoundVolume(sound: ActiveSound, volume: number): void {
    if (sound.tones) {
      sound.tones.volume = volume;
      this.applyGain(sound.tones);
    }
    if (sound.audio) {
      sound.audio.volume = volume;
    }
  }

  private setSoundMuted(sound: ActiveSound, muted: boolean): void {
    if (sound.tones) {
      sound.tones.muted = muted;
      this.applyGain(sound.tones);
    }
    if (sound.audio) {
      sound.audio.muted = muted;
    }
  }

  /**
   * The gain carries the volume, or silence while muted
   */
  private applyGain(tones: ToneVoice): void {
    tones.gain.gain.value = tones.muted ? 0 : tones.volume;
  }

  /**
   * Resume a suspended context, then schedule the first pass of the pattern
   */
  private async startTones(context: AudioContext, sound: ActiveSound, pattern: TonePattern): Promise<void> {
    if (context.state === 'suspended') {
      // A browser that blocks audio leaves resume() pending; a play waits a second at most
      let wait: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        context.resume(),
        new Promise<void>((resolve) => {
          wait = setTimeout(resolve, RESUME_WAIT_MS);
        }),
      ]).finally(() => clearTimeout(wait));
    }
    if (context.state !== 'running') {
      throw new Error(`The audio context is ${context.state}`);
    }
    // Stopped while the context resumed
    if (!sound.tones || sound.tones.stopped) return;

    this.scheduleTones(context, sound, pattern, context.currentTime);
  }

  /**
   * Schedule one pass of the pattern on the context's clock, from `at` seconds.
   * A looping sound queues its next pass when this one starts, a whole pass ahead.
   */
  private scheduleTones(context: AudioContext, sound: ActiveSound, pattern: TonePattern, at: number): void {
    const tones = sound.tones!;
    const ramp = TONE_RAMP_MS / 1000;
    let time = at;

    pattern.tones.forEach((tone, index) => {
      const end = time + tone.duration / 1000;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = pattern.wave;
      oscillator.frequency.value = tone.frequency;

      // Ramp in and out so the tone does not click
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(pattern.level, time + ramp);
      envelope.gain.setValueAtTime(pattern.level, end - ramp);
      envelope.gain.linearRampToValueAtTime(0, end);

      oscillator.connect(envelope);
      envelope.connect(tones.gain);

      const isLast = index === pattern.tones.length - 1;
      oscillator.onended = () => {
        tones.oscillators.delete(oscillator);
        oscillator.disconnect();
        envelope.disconnect();
        if (isLast && !sound.loop) {
          this.finishTones(sound);
        }
      };

      tones.oscillators.add(oscillator);
      oscillator.start(time);
      oscillator.stop(end);
      time = end + tone.gapAfter / 1000;
    });

    if (sound.loop) {
      const next = time + (pattern.repeatPause ?? DEFAULT_REPEAT_PAUSE_MS) / 1000;
      tones.timer = setTimeout(() => {
        tones.timer = null;
        if (tones.stopped) return;
        this.scheduleTones(context, sound, pattern, Math.max(next, context.currentTime));
      }, Math.max(0, (at - context.currentTime) * 1000));
    }
  }

  /**
   * A sound that does not loop leaves the active list when its last tone ends
   */
  private finishTones(sound: ActiveSound): void {
    if (!sound.tones || sound.tones.stopped) return;

    this.halt(sound);
    this.activeSounds.delete(sound.id);
    if (sound.onEnd) {
      sound.onEnd();
    }
  }

  /**
   * Silence a sound: stop its tones and disconnect its gain, or pause its audio element
   */
  private halt(sound: ActiveSound): void {
    const tones = sound.tones;
    if (tones) {
      tones.stopped = true;
      if (tones.timer !== null) {
        clearTimeout(tones.timer);
        tones.timer = null;
      }
      tones.oscillators.forEach((oscillator) => {
        try {
          oscillator.stop();
        } catch {
          // Not started
        }
      });
      tones.oscillators.clear();
      tones.gain.disconnect();
    }
    if (sound.audio) {
      sound.audio.pause();
      sound.audio.currentTime = 0;
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: SoundManager | null = null;

export function getSoundManager(): SoundManager {
  if (!instance) {
    instance = new SoundManager();
  }
  return instance;
}

// =============================================================================
// React Hook
// =============================================================================

import { useEffect, useState, useCallback } from 'react';

export function useSoundManager() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const [emergencyMode, setEmergencyMode] = useState(false);
  
  const manager = getSoundManager();

  useEffect(() => {
    const initManager = async () => {
      await manager.initialize();
      setIsInitialized(true);
      setVolume(manager.getUserVolume());
      setMuted(manager.isGlobalMuted());
      setEmergencyMode(manager.isEmergencyModeActive());
    };
    
    initManager();
  }, []);

  const updateVolume = useCallback((newVolume: number) => {
    manager.setUserVolume(newVolume);
    setVolume(newVolume);
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = !manager.isGlobalMuted();
    manager.setGlobalMute(newMuted);
    setMuted(newMuted);
  }, []);

  const play = useCallback((type: SoundType, options?: PlayOptions) => {
    return manager.play(type, options);
  }, []);

  const playForSeverity = useCallback((severity: AlertSeverity, options?: PlayOptions) => {
    return manager.playForSeverity(severity, options);
  }, []);

  const startEmergency = useCallback(() => {
    setEmergencyMode(true);
    return manager.startEmergencyAlarm();
  }, []);

  const stopEmergency = useCallback(() => {
    setEmergencyMode(false);
    manager.stopEmergencyAlarm();
  }, []);

  const stop = useCallback((id: string) => {
    manager.stop(id);
  }, []);

  const stopAll = useCallback(() => {
    manager.stopAll();
  }, []);

  const test = useCallback((type: SoundType) => {
    return manager.test(type);
  }, []);

  const testEmergency = useCallback(() => {
    manager.testEmergency();
  }, []);

  // Custom sound methods
  const playForTrigger = useCallback(async (trigger: SoundTrigger) => {
    return manager.playForTrigger(trigger);
  }, []);

  const playCustomSound = useCallback(async (sound: CustomSound) => {
    return manager.playCustomSound(sound);
  }, []);

  const stopCustomSounds = useCallback(() => {
    manager.stopCustomSounds();
  }, []);

  return {
    isInitialized,
    volume,
    muted,
    emergencyMode,
    updateVolume,
    toggleMute,
    play,
    playForSeverity,
    startEmergency,
    stopEmergency,
    stop,
    stopAll,
    test,
    testEmergency,
    // Custom sound methods
    playForTrigger,
    playCustomSound,
    stopCustomSounds,
    isPlaying: () => manager.isPlaying(),
    getActiveSounds: () => manager.getActiveSounds(),
  };
}

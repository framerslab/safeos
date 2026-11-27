/**
 * Custom Media Player
 * 
 * Manages uploaded audio files and images for Lost & Found alerts.
 * Supports sequential playback with loop/count options and timer-based termination.
 * 
 * @module lib/custom-media-player
 */

import { Howl } from 'howler';
import { SPOKEN_DEFAULT } from './lost-found-words';
import { findSpokenAlertVoice, voicesWhenListed } from './tts-alerts';

// =============================================================================
// Types
// =============================================================================

export interface UploadedImage {
  id: string;
  name: string;
  data: string; // base64
  mimeType: string;
  width?: number;
  height?: number;
  uploadedAt: number;
}

export interface UploadedAudio {
  id: string;
  name: string;
  data: string; // base64
  mimeType: string;
  durationMs?: number;
  uploadedAt: number;
}

export type PlaybackMode = 'count' | 'loop' | 'timer';

export interface CustomMediaConfig {
  images: UploadedImage[];
  audioFiles: UploadedAudio[];
  playbackMode: PlaybackMode;
  repeatCount: number;
  timerDurationMs: number;
  displayIntervalMs: number;
  shuffleOrder: boolean;
  ttsMessages: string[];
  ttsEnabled: boolean;
  audioEnabled: boolean;
  imageEnabled: boolean;
}

export const DEFAULT_MEDIA_CONFIG: CustomMediaConfig = {
  images: [],
  audioFiles: [],
  playbackMode: 'count',
  repeatCount: 3,
  timerDurationMs: 60000, // 1 minute
  displayIntervalMs: 3000, // 3 seconds per image
  shuffleOrder: false,
  ttsMessages: [],
  ttsEnabled: true,
  audioEnabled: true,
  imageEnabled: true,
};

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentImageIndex: number;
  currentAudioIndex: number;
  currentMessageIndex: number;
  completedCycles: number;
  startTime: number | null;
  elapsedMs: number;
  remainingMs: number;
}

export interface MediaPlayerCallbacks {
  onImageChange?: (image: UploadedImage | null, index: number) => void;
  onAudioPlay?: (audio: UploadedAudio, index: number) => void;
  onMessageSpeak?: (message: string, index: number) => void;
  onCycleComplete?: (cycleNumber: number) => void;
  onPlaybackEnd?: (reason: 'count' | 'timer' | 'manual') => void;
  onError?: (error: Error) => void;
}

// =============================================================================
// Custom Media Player Class
// =============================================================================

export class CustomMediaPlayer {
  private config: CustomMediaConfig;
  private callbacks: MediaPlayerCallbacks;
  private state: PlaybackState;
  private currentHowl: Howl | null = null;
  private imageTimer: ReturnType<typeof setInterval> | null = null;
  private playbackTimer: ReturnType<typeof setInterval> | null = null;
  private speechSynth: SpeechSynthesis | null = null;
  // Counts starts, so a wait for the voice list ends with the playback that began it.
  private playbacks = 0;
  // A sound or message that came due during a pause; it plays once the pause ends.
  private pausedStep: { voicesAwaited: boolean } | null = null;
  // Waits for a voice when a message has none; it ends with its playback.
  private voiceWait: (() => void) | null = null;
  private noVoiceReportedFor = 0;

  constructor(
    config: Partial<CustomMediaConfig> = {},
    callbacks: MediaPlayerCallbacks = {}
  ) {
    this.config = { ...DEFAULT_MEDIA_CONFIG, ...config };
    this.callbacks = callbacks;
    this.state = this.getInitialState();
    
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.speechSynth = window.speechSynthesis;
    }
  }

  private getInitialState(): PlaybackState {
    return {
      isPlaying: false,
      isPaused: false,
      currentImageIndex: -1,
      currentAudioIndex: -1,
      currentMessageIndex: -1,
      completedCycles: 0,
      startTime: null,
      elapsedMs: 0,
      remainingMs: 0,
    };
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<CustomMediaConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current state
   */
  getState(): PlaybackState {
    return { ...this.state };
  }

  /**
   * Start playback
   */
  start(): void {
    if (this.state.isPlaying) return;

    this.playbacks += 1;
    this.pausedStep = null;
    this.state = {
      ...this.getInitialState(),
      isPlaying: true,
      startTime: Date.now(),
    };

    if (this.config.playbackMode === 'timer') {
      this.state.remainingMs = this.config.timerDurationMs;
      this.startPlaybackTimer();
    }

    this.startImageCycle();
    this.startMediaCycle();
  }

  /**
   * Stop playback
   */
  stop(reason: 'count' | 'timer' | 'manual' = 'manual'): void {
    this.stopImageCycle();
    this.stopPlaybackTimer();
    this.stopCurrentAudio();
    this.cancelSpeech();
    
    this.state.isPlaying = false;
    this.state.isPaused = false;
    this.pausedStep = null;
    this.stopWaitingForVoice();
    
    this.callbacks.onPlaybackEnd?.(reason);
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.state.isPlaying || this.state.isPaused) return;
    
    this.state.isPaused = true;
    this.currentHowl?.pause();
    this.speechSynth?.pause();
    this.stopImageCycle();
    this.stopPlaybackTimer();
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (!this.state.isPlaying || !this.state.isPaused) return;
    
    this.state.isPaused = false;
    this.currentHowl?.play();
    this.speechSynth?.resume();
    this.startImageCycle();
    
    if (this.config.playbackMode === 'timer') {
      this.startPlaybackTimer();
    }

    const step = this.pausedStep;
    this.pausedStep = null;
    if (step) this.playNextMedia(step.voicesAwaited);
  }

  /**
   * Start image cycling
   */
  private startImageCycle(): void {
    if (!this.config.imageEnabled || this.config.images.length === 0) return;
    
    this.stopImageCycle();
    
    // Show first image immediately
    this.showNextImage();
    
    // Start interval
    this.imageTimer = setInterval(() => {
      this.showNextImage();
    }, this.config.displayIntervalMs);
  }

  /**
   * Stop image cycling
   */
  private stopImageCycle(): void {
    if (this.imageTimer) {
      clearInterval(this.imageTimer);
      this.imageTimer = null;
    }
  }

  /**
   * Show next image
   */
  private showNextImage(): void {
    if (this.config.images.length === 0) return;
    
    this.state.currentImageIndex = 
      (this.state.currentImageIndex + 1) % this.config.images.length;
    
    const image = this.config.images[this.state.currentImageIndex];
    this.callbacks.onImageChange?.(image, this.state.currentImageIndex);
    
    // Check if completed a full cycle
    if (this.state.currentImageIndex === this.config.images.length - 1) {
      this.checkCycleCompletion();
    }
  }

  /**
   * Start media cycle (audio and TTS)
   */
  private startMediaCycle(): void {
    this.playNextMedia();
  }

  /**
   * Play next media item
   */
  private playNextMedia(voicesAwaited = false): void {
    if (!this.state.isPlaying) return;
    if (this.state.isPaused) {
      this.pausedStep = { voicesAwaited };
      return;
    }

    // Alternate between audio and TTS
    const hasAudio = this.config.audioEnabled && this.config.audioFiles.length > 0;
    const wantsSpeech = this.config.ttsEnabled && this.config.ttsMessages.length > 0;
    const voices = wantsSpeech ? this.speechSynth?.getVoices() ?? [] : [];
    // A browser may list no voices until it has read them. With no sound to
    // play first, the message waits for the list once.
    if (wantsSpeech && !hasAudio && voices.length === 0 && this.speechSynth && !voicesAwaited) {
      const playback = this.playbacks;
      void voicesWhenListed(this.speechSynth).then(() => {
        if (this.playbacks === playback) this.playNextMedia(true);
      });
      return;
    }
    // Lost and Found's own line is English; a line the person wrote takes the page's language.
    const next = wantsSpeech
      ? this.config.ttsMessages[(this.state.currentMessageIndex + 1) % this.config.ttsMessages.length]
      : undefined;
    const voice = next === undefined ? undefined : findSpokenAlertVoice(voices, next === SPOKEN_DEFAULT ? 'en' : undefined);

    if (hasAudio && voice) {
      // Alternate
      if (this.state.currentAudioIndex <= this.state.currentMessageIndex) {
        this.playNextAudio();
      } else {
        this.speakNextMessage(voice);
      }
    } else if (hasAudio) {
      this.playNextAudio();
    } else if (voice) {
      this.speakNextMessage(voice);
    } else if (wantsSpeech) {
      this.waitForVoice();
    }
  }

  /**
   * A message with no voice to read it, and no sound to play instead, is
   * reported once and waits for the browser to list a voice.
   */
  private waitForVoice(): void {
    const synth = this.speechSynth;
    if (this.voiceWait) return;
    if (this.noVoiceReportedFor !== this.playbacks) {
      this.noVoiceReportedFor = this.playbacks;
      this.callbacks.onError?.(new Error('No voice on this device can read the spoken message.'));
    }
    if (!synth || typeof synth.addEventListener !== 'function') return;
    const playback = this.playbacks;
    const listed = () => {
      this.stopWaitingForVoice();
      if (this.playbacks === playback) this.playNextMedia(true);
    };
    this.voiceWait = () => synth.removeEventListener('voiceschanged', listed);
    synth.addEventListener('voiceschanged', listed);
  }

  private stopWaitingForVoice(): void {
    this.voiceWait?.();
    this.voiceWait = null;
  }

  /**
   * The next step, 500 ms after a sound or message ends, belongs to the
   * playback that began that sound or message.
   */
  private continueLater(playback = this.playbacks): void {
    setTimeout(() => {
      if (this.playbacks === playback) this.playNextMedia();
    }, 500);
  }

  /**
   * Play next audio file
   */
  private playNextAudio(): void {
    if (this.config.audioFiles.length === 0) return;
    
    this.state.currentAudioIndex = 
      (this.state.currentAudioIndex + 1) % this.config.audioFiles.length;
    
    const audio = this.config.audioFiles[this.state.currentAudioIndex];
    const playback = this.playbacks;
    
    this.stopCurrentAudio();
    
    try {
      this.currentHowl = new Howl({
        src: [audio.data],
        format: [audio.mimeType.split('/')[1] || 'mp3'],
        onend: () => {
          // Howler reports the end from a timer, so a stopped playback's sound
          // can end after the next playback began its own.
          if (this.playbacks !== playback) return;
          // A finished sound is let go, so ending a pause never plays it again.
          this.stopCurrentAudio();
          this.callbacks.onAudioPlay?.(audio, this.state.currentAudioIndex);
          this.continueLater(playback);
        },
        onloaderror: (_, error) => {
          console.error('[CustomMediaPlayer] Audio load error:', error);
          this.callbacks.onError?.(new Error(`Failed to load audio: ${audio.name}`));
          this.continueLater(playback);
        },
      });
      
      this.currentHowl.play();
    } catch (error) {
      console.error('[CustomMediaPlayer] Audio playback error:', error);
      this.continueLater(playback);
    }
  }

  /**
   * Stop current audio
   */
  private stopCurrentAudio(): void {
    if (this.currentHowl) {
      this.currentHowl.stop();
      this.currentHowl.unload();
      this.currentHowl = null;
    }
  }

  /**
   * Speak next TTS message
   */
  private speakNextMessage(voice: SpeechSynthesisVoice): void {
    if (!this.speechSynth) return;

    this.state.currentMessageIndex = 
      (this.state.currentMessageIndex + 1) % this.config.ttsMessages.length;
    
    const message = this.config.ttsMessages[this.state.currentMessageIndex];
    // A browser can report a cancelled message after the next playback began.
    const playback = this.playbacks;
    
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onend = () => {
      if (this.playbacks !== playback) return;
      this.callbacks.onMessageSpeak?.(message, this.state.currentMessageIndex);
      this.continueLater(playback);
    };
    
    utterance.onerror = () => {
      this.continueLater(playback);
    };
    
    this.cancelSpeech();
    this.speechSynth.speak(utterance);
  }

  /**
   * Cancel current speech
   */
  private cancelSpeech(): void {
    this.speechSynth?.cancel();
  }

  /**
   * Start playback timer
   */
  private startPlaybackTimer(): void {
    this.stopPlaybackTimer();
    
    this.playbackTimer = setInterval(() => {
      this.state.elapsedMs = Date.now() - (this.state.startTime || Date.now());
      
      if (this.config.playbackMode === 'timer') {
        this.state.remainingMs = Math.max(
          0,
          this.config.timerDurationMs - this.state.elapsedMs
        );
        
        if (this.state.remainingMs <= 0) {
          this.stop('timer');
        }
      }
    }, 100);
  }

  /**
   * Stop playback timer
   */
  private stopPlaybackTimer(): void {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  /**
   * Check if cycle is complete
   */
  private checkCycleCompletion(): void {
    this.state.completedCycles++;
    this.callbacks.onCycleComplete?.(this.state.completedCycles);
    
    if (
      this.config.playbackMode === 'count' &&
      this.state.completedCycles >= this.config.repeatCount
    ) {
      this.stop('count');
    }
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.stop('manual');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let playerInstance: CustomMediaPlayer | null = null;

/**
 * Get or create media player
 */
export function getMediaPlayer(
  config?: Partial<CustomMediaConfig>,
  callbacks?: MediaPlayerCallbacks
): CustomMediaPlayer {
  if (!playerInstance) {
    playerInstance = new CustomMediaPlayer(config, callbacks);
  } else if (config) {
    playerInstance.updateConfig(config);
  }
  return playerInstance;
}

/**
 * Reset player
 */
export function resetMediaPlayer(): void {
  if (playerInstance) {
    playerInstance.dispose();
    playerInstance = null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create image from file
 */
export async function createUploadedImage(file: File): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const data = reader.result as string;
      
      // Get image dimensions
      const img = new Image();
      img.onload = () => {
        resolve({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          data,
          mimeType: file.type,
          width: img.width,
          height: img.height,
          uploadedAt: Date.now(),
        });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = data;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Create audio from file
 */
export async function createUploadedAudio(file: File): Promise<UploadedAudio> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const data = reader.result as string;
      
      // Get audio duration
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        resolve({
          id: `audio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          data,
          mimeType: file.type,
          durationMs: audio.duration * 1000,
          uploadedAt: Date.now(),
        });
      };
      audio.onerror = () => {
        // Resolve without duration if we can't get it
        resolve({
          id: `audio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          data,
          mimeType: file.type,
          uploadedAt: Date.now(),
        });
      };
      audio.src = data;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Validate image file
 */
export function isValidImageFile(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return validTypes.includes(file.type);
}

/**
 * Validate audio file
 */
export function isValidAudioFile(file: File): boolean {
  const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
  return validTypes.includes(file.type);
}

/**
 * Calculate total media size
 */
export function calculateMediaSize(
  images: UploadedImage[],
  audioFiles: UploadedAudio[]
): number {
  let totalSize = 0;
  
  for (const img of images) {
    // Base64 is roughly 4/3 the size of binary
    totalSize += (img.data.length * 3) / 4;
  }
  
  for (const audio of audioFiles) {
    totalSize += (audio.data.length * 3) / 4;
  }
  
  return totalSize;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}





























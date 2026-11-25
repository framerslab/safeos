/**
 * TTS Alert System
 * 
 * Browser-based Text-to-Speech for security alerts.
 * Provides authoritative and alarm-style voice warnings
 * with customizable messages and continuous playback.
 * 
 * @module lib/tts-alerts
 */

import { useSettingsStore } from '@/stores/settings-store';

// =============================================================================
// Types
// =============================================================================

export type MessageCategory = 'authoritative' | 'alarm' | 'custom';

export interface TTSConfig {
  /** Speech rate (0.1 to 10) */
  rate: number;
  /** Speech pitch (0 to 2) */
  pitch: number;
  /** Speech volume (0 to 1) */
  volume: number;
  /** Delay between repeated messages in ms */
  repeatDelay: number;
  /** Whether to use random message selection */
  randomize: boolean;
}

export interface TTSState {
  isSpeaking: boolean;
  isRepeating: boolean;
  currentMessage: string | null;
  availableVoices: SpeechSynthesisVoice[];
}

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  repeatDelay: 2000,
  randomize: true,
};

// =============================================================================
// Preset Messages
// =============================================================================

export const PRESET_MESSAGES: Record<MessageCategory, string[]> = {
  authoritative: [
    'Warning! You are being recorded. Leave immediately.',
    'Security alert. Authorities have been notified.',
    'Intruder detected. This area is under surveillance.',
    'Unauthorized entry detected. You are being monitored.',
    'Warning. This property is protected. Exit now.',
    'Alert! Your presence has been logged. Leave the premises.',
    'Attention! Security breach detected. Recording in progress.',
    'You are trespassing. Authorities are en route.',
  ],
  alarm: [
    'Intruder alert! Help!',
    'Go away! Go away!',
    'Alert! Alert! Intruder!',
    'Help! Someone call for help!',
    'Danger! Danger! Intruder detected!',
    'Emergency! Emergency!',
    'Alert! Unauthorized person!',
    'Warning! Warning! Warning!',
  ],
  custom: [],
};

/** A named online voice is used only when the person chose that voice on this browser. */
export function findSpokenAlertVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const chosenURI = useSettingsStore.getState().spokenAlertVoiceURI;
  const chosen = chosenURI ? voices.find((voice) => voice.localService === false && voice.voiceURI === chosenURI) : undefined;
  if (chosen) return chosen;

  const language = (typeof document !== 'undefined' && document.documentElement.lang || 'en').toLowerCase();
  const primaryLanguage = language.split('-')[0];
  const local = voices.filter((voice) => voice.localService === true);
  return local.find((voice) => voice.lang.toLowerCase() === language)
    ?? local.find((voice) => voice.lang.toLowerCase().split('-')[0] === primaryLanguage)
    ?? local[0];
}

// =============================================================================
// TTS Manager Class
// =============================================================================

export class TTSManager {
  private config: TTSConfig;
  private synth: SpeechSynthesis | null = null;
  private repeatInterval: ReturnType<typeof setInterval> | null = null;
  private currentCategory: MessageCategory = 'authoritative';
  private messageIndex: number = 0;
  private customMessages: string[] = [];
  private isRepeating: boolean = false;
  private isSpeaking: boolean = false;
  private currentMessage: string | null = null;

  constructor(config: Partial<TTSConfig> = {}) {
    this.config = { ...DEFAULT_TTS_CONFIG, ...config };
  }

  /**
   * Initialize the TTS system
   */
  async initialize(): Promise<void> {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('[TTS] Speech synthesis not available');
      return;
    }

    this.synth = window.speechSynthesis;
  }

  /** Update configuration. */
  updateConfig(config: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set custom messages
   */
  setCustomMessages(messages: string[]): void {
    this.customMessages = messages;
    PRESET_MESSAGES.custom = messages;
  }

  /**
   * Add a custom message
   */
  addCustomMessage(message: string): void {
    this.customMessages.push(message);
    PRESET_MESSAGES.custom = this.customMessages;
  }

  /**
   * Get available voices
   */
  getVoices(): SpeechSynthesisVoice[] {
    return this.synth?.getVoices() ?? [];
  }

  /**
   * Get current state
   */
  getState(): TTSState {
    return {
      isSpeaking: this.isSpeaking,
      isRepeating: this.isRepeating,
      currentMessage: this.currentMessage,
      availableVoices: this.getVoices(),
    };
  }

  /**
   * Speak a single message
   */
  speak(message: string): void {
    if (!this.synth) {
      console.warn('[TTS] Not initialized');
      return;
    }

    const voice = findSpokenAlertVoice(this.getVoices());
    if (!voice) return;

    // Cancel any ongoing speech
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = this.config.rate;
    utterance.pitch = this.config.pitch;
    utterance.volume = this.config.volume;

    utterance.voice = voice;
    utterance.lang = voice.lang;

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.currentMessage = message;
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentMessage = null;
    };

    utterance.onerror = (event) => {
      console.error('[TTS] Speech error:', event.error);
      this.isSpeaking = false;
      this.currentMessage = null;
    };

    this.synth.speak(utterance);
  }

  /**
   * Get the next message from the selected category
   */
  private getNextMessage(): string {
    const messages = this.currentCategory === 'custom' 
      ? this.customMessages 
      : PRESET_MESSAGES[this.currentCategory];

    if (!messages.length) {
      return PRESET_MESSAGES.alarm[0]; // Fallback
    }

    if (this.config.randomize) {
      return messages[Math.floor(Math.random() * messages.length)];
    }

    const message = messages[this.messageIndex % messages.length];
    this.messageIndex++;
    return message;
  }

  /**
   * Start speaking alerts from a category
   */
  speakCategory(category: MessageCategory): void {
    this.currentCategory = category;
    this.speak(this.getNextMessage());
  }

  /**
   * Start continuous alert mode
   */
  startContinuousAlert(category: MessageCategory = 'authoritative'): void {
    if (this.isRepeating) return;

    this.currentCategory = category;
    this.isRepeating = true;
    this.messageIndex = 0;

    // Speak first message immediately
    this.speak(this.getNextMessage());

    // Set up repeating
    this.repeatInterval = setInterval(() => {
      if (!this.isSpeaking) {
        this.speak(this.getNextMessage());
      }
    }, this.config.repeatDelay);
  }

  /**
   * Stop continuous alerts
   */
  stopContinuousAlert(): void {
    this.isRepeating = false;

    if (this.repeatInterval) {
      clearInterval(this.repeatInterval);
      this.repeatInterval = null;
    }

    if (this.synth) {
      this.synth.cancel();
    }

    this.isSpeaking = false;
    this.currentMessage = null;
  }

  /**
   * Stop all speech
   */
  stop(): void {
    this.stopContinuousAlert();
  }

  /**
   * Speak mixed categories for more variation
   */
  startMixedAlert(): void {
    if (this.isRepeating) return;

    this.isRepeating = true;
    const categories: MessageCategory[] = ['authoritative', 'alarm'];
    let categoryIndex = 0;

    // Speak first message
    this.currentCategory = categories[0];
    this.speak(this.getNextMessage());

    // Alternate between categories
    this.repeatInterval = setInterval(() => {
      if (!this.isSpeaking) {
        categoryIndex = (categoryIndex + 1) % categories.length;
        this.currentCategory = categories[categoryIndex];
        this.speak(this.getNextMessage());
      }
    }, this.config.repeatDelay);
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stop();
    this.synth = null;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let ttsInstance: TTSManager | null = null;

/**
 * Get or create the singleton TTS manager
 */
export function getTTSManager(config?: Partial<TTSConfig>): TTSManager {
  if (!ttsInstance) {
    ttsInstance = new TTSManager(config);
  } else if (config) {
    ttsInstance.updateConfig(config);
  }
  return ttsInstance;
}

/**
 * Reset the TTS manager
 */
export function resetTTSManager(): void {
  if (ttsInstance) {
    ttsInstance.dispose();
    ttsInstance = null;
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Speak a quick security warning
 */
export async function speakSecurityWarning(
  message?: string,
  config?: Partial<TTSConfig>
): Promise<void> {
  const tts = getTTSManager(config);
  await tts.initialize();
  
  if (message) {
    tts.speak(message);
  } else {
    tts.speakCategory('authoritative');
  }
}

/**
 * Start continuous security alert
 */
export async function startSecurityAlert(
  mode: 'authoritative' | 'alarm' | 'mixed' = 'mixed',
  config?: Partial<TTSConfig>
): Promise<void> {
  const tts = getTTSManager(config);
  await tts.initialize();
  
  if (mode === 'mixed') {
    tts.startMixedAlert();
  } else {
    tts.startContinuousAlert(mode);
  }
}

/**
 * Stop security alert
 */
export function stopSecurityAlert(): void {
  const tts = getTTSManager();
  tts.stop();
}

/**
 * Check if TTS is supported
 */
export function isTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}


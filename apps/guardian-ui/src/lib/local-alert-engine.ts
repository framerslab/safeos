/**
 * Local Alert Engine
 *
 * Client-side alert management system that works without backend.
 * Triggers alerts based on detection thresholds, stores in IndexedDB,
 * plays escalating sounds via Web Audio API, and shows web notifications.
 *
 * @module lib/local-alert-engine
 */

'use client';

import { cacheAlert, getCachedAlerts, saveSetting, getSetting } from './client-db';
import { useAuthStore } from '@/stores/auth-store';
import { getNotificationManager } from './notification-manager';

// =============================================================================
// Types
// =============================================================================

export type AlertType =
  | 'motion'
  | 'audio'
  | 'person'
  | 'animal'
  | 'inactivity'
  | 'intrusion'
  | 'dangerous-animal'
  | 'subject-match'
  | 'system';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

export interface LocalAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  description?: string;
  timestamp: number;
  acknowledged: boolean;
  acknowledgedAt?: string;
  streamId?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertThresholds {
  /** Motion sensitivity (0-100, higher = more sensitive) */
  motionSensitivity: number;
  /** Audio level threshold (0-100, dB equivalent) */
  audioThreshold: number;
  /** Person detection confidence (0-1) */
  personConfidence: number;
  /** Animal detection confidence (0-1) */
  animalConfidence: number;
  /** Inactivity timeout in minutes */
  inactivityTimeout: number;
  /** Maximum allowed persons before intrusion alert */
  maxAllowedPersons: number;
  /** Cooldown between same-type alerts in seconds */
  alertCooldown: number;
}

export interface AlertSound {
  frequency: number;
  duration: number;
  volume: number;
  pattern: 'single' | 'double' | 'triple' | 'escalating' | 'continuous';
}

export interface LocalAlertEngineConfig {
  thresholds: AlertThresholds;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  escalationEnabled: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_THRESHOLDS: AlertThresholds = {
  motionSensitivity: 50,
  audioThreshold: 60,
  personConfidence: 0.6,
  animalConfidence: 0.5,
  inactivityTimeout: 30,
  maxAllowedPersons: 0,
  alertCooldown: 30,
};

const DEFAULT_CONFIG: LocalAlertEngineConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  soundEnabled: true,
  notificationsEnabled: true,
  escalationEnabled: true,
};

const SEVERITY_SOUNDS: Record<AlertSeverity, AlertSound> = {
  info: {
    frequency: 440,
    duration: 200,
    volume: 0.3,
    pattern: 'single',
  },
  warning: {
    frequency: 660,
    duration: 300,
    volume: 0.5,
    pattern: 'double',
  },
  critical: {
    frequency: 880,
    duration: 400,
    volume: 0.7,
    pattern: 'triple',
  },
  emergency: {
    frequency: 1000,
    duration: 500,
    volume: 1.0,
    pattern: 'escalating',
  },
};

const ALERT_MESSAGES: Record<AlertType, { title: string; getDescription: (data?: any) => string }> = {
  motion: {
    title: 'Motion Detected',
    getDescription: (data) => data?.zone ? `Movement detected in ${data.zone}` : 'Movement detected in frame',
  },
  audio: {
    title: 'Audio Alert',
    getDescription: (data) => {
      const level = data?.level ? `${Math.round(data.level)}dB` : 'elevated';
      const pattern = data?.pattern || 'noise';
      return `${pattern} detected at ${level}`;
    },
  },
  person: {
    title: 'Person Detected',
    getDescription: (data) => {
      const count = data?.count || 1;
      return `${count} person${count > 1 ? 's' : ''} detected in frame`;
    },
  },
  animal: {
    title: 'Animal Detected',
    getDescription: (data) => data?.type ? `${data.type} detected` : 'Animal detected in frame',
  },
  inactivity: {
    title: 'Inactivity Alert',
    getDescription: (data) => {
      const minutes = data?.minutes || 'extended';
      return `No activity detected for ${minutes} minutes`;
    },
  },
  intrusion: {
    title: 'Intrusion Detected',
    getDescription: (data) => {
      const count = data?.count || 'multiple';
      const allowed = data?.allowed || 0;
      return `${count} persons detected (${allowed} allowed)`;
    },
  },
  'dangerous-animal': {
    title: 'Dangerous Animal Alert',
    getDescription: (data) => data?.type ? `Potentially dangerous: ${data.type}` : 'Dangerous animal detected',
  },
  'subject-match': {
    title: 'Subject Match',
    getDescription: (data) => data?.name ? `${data.name} detected` : 'Registered subject detected',
  },
  system: {
    title: 'System Alert',
    getDescription: (data) => data?.message || 'System notification',
  },
};

// =============================================================================
// Sound Manager (Web Audio API)
// =============================================================================

class SoundManager {
  private audioContext: AudioContext | null = null;
  private isPlaying = false;
  private currentOscillator: OscillatorNode | null = null;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  async resumeContext(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  async playTone(frequency: number, duration: number, volume: number): Promise<void> {
    await this.resumeContext();
    const ctx = this.getContext();

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    // Fade in/out to avoid clicks
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration / 1000 - 0.01);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);

    this.currentOscillator = oscillator;

    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }

  async playPattern(sound: AlertSound): Promise<void> {
    if (this.isPlaying) return;
    this.isPlaying = true;

    try {
      const { frequency, duration, volume, pattern } = sound;

      switch (pattern) {
        case 'single':
          await this.playTone(frequency, duration, volume);
          break;

        case 'double':
          await this.playTone(frequency, duration, volume);
          await this.delay(100);
          await this.playTone(frequency, duration, volume);
          break;

        case 'triple':
          for (let i = 0; i < 3; i++) {
            await this.playTone(frequency, duration, volume);
            if (i < 2) await this.delay(100);
          }
          break;

        case 'escalating':
          // Rising frequency pattern
          for (let i = 0; i < 5; i++) {
            const escalatedFreq = frequency + i * 100;
            await this.playTone(escalatedFreq, duration * 0.8, volume);
            await this.delay(50);
          }
          break;

        case 'continuous':
          // Long continuous tone with warble
          for (let i = 0; i < 10; i++) {
            const warbleFreq = frequency + Math.sin(i * 0.5) * 50;
            await this.playTone(warbleFreq, 200, volume);
          }
          break;
      }
    } finally {
      this.isPlaying = false;
    }
  }

  stop(): void {
    if (this.currentOscillator) {
      try {
        this.currentOscillator.stop();
      } catch {
        // Already stopped
      }
      this.currentOscillator = null;
    }
    this.isPlaying = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Local Alert Engine
// =============================================================================

class LocalAlertEngine {
  private config: LocalAlertEngineConfig = DEFAULT_CONFIG;
  private soundManager: SoundManager = new SoundManager();
  private lastAlerts: Map<AlertType, number> = new Map();
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(alert: LocalAlert) => void> = new Set();
  private initialized = false;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized || typeof window === 'undefined') return;

    // Load saved config
    const savedConfig = await getSetting<LocalAlertEngineConfig>('alert_engine_config');
    if (savedConfig) {
      this.config = { ...DEFAULT_CONFIG, ...savedConfig };
    }

    this.initialized = true;
    console.log('[LocalAlertEngine] Initialized with config:', this.config);
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  async updateConfig(updates: Partial<LocalAlertEngineConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await saveSetting('alert_engine_config', this.config);
  }

  async updateThresholds(updates: Partial<AlertThresholds>): Promise<void> {
    this.config.thresholds = { ...this.config.thresholds, ...updates };
    await saveSetting('alert_engine_config', this.config);
  }

  getConfig(): LocalAlertEngineConfig {
    return { ...this.config };
  }

  getThresholds(): AlertThresholds {
    return { ...this.config.thresholds };
  }

  // ---------------------------------------------------------------------------
  // Alert Creation
  // ---------------------------------------------------------------------------

  async createAlert(
    type: AlertType,
    severity: AlertSeverity,
    options: {
      streamId?: string;
      metadata?: Record<string, unknown>;
      customMessage?: string;
      customDescription?: string;
    } = {}
  ): Promise<LocalAlert | null> {
    // Check cooldown
    if (!this.shouldTriggerAlert(type)) {
      console.log(`[LocalAlertEngine] Alert ${type} in cooldown`);
      return null;
    }

    const alertDef = ALERT_MESSAGES[type];
    const alert: LocalAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      severity,
      message: options.customMessage || alertDef.title,
      description: options.customDescription || alertDef.getDescription(options.metadata),
      timestamp: Date.now(),
      acknowledged: false,
      streamId: options.streamId,
      metadata: options.metadata,
    };

    // Store in IndexedDB
    await cacheAlert({
      id: alert.id,
      streamId: alert.streamId || 'local',
      severity: alert.severity,
      message: alert.message,
      description: alert.description,
      acknowledged: false,
      createdAt: new Date(alert.timestamp).toISOString(),
    });

    // Update cooldown
    this.lastAlerts.set(type, Date.now());

    // Play sound
    if (this.config.soundEnabled) {
      await this.playAlertSound(severity);
    }

    // Show notification
    if (this.config.notificationsEnabled) {
      await this.showNotification(alert);
    }

    // Notify listeners
    this.notifyListeners(alert);

    console.log('[LocalAlertEngine] Created alert:', alert);
    return alert;
  }

  // ---------------------------------------------------------------------------
  // Detection Handlers
  // ---------------------------------------------------------------------------

  async handleMotionDetection(
    level: number,
    options: { streamId?: string; zone?: string } = {}
  ): Promise<LocalAlert | null> {
    const threshold = this.config.thresholds.motionSensitivity / 100;
    if (level < threshold) return null;

    const severity = this.calculateSeverity(level, threshold);
    return this.createAlert('motion', severity, {
      streamId: options.streamId,
      metadata: { level, zone: options.zone },
    });
  }

  async handleAudioDetection(
    level: number,
    options: { streamId?: string; pattern?: string } = {}
  ): Promise<LocalAlert | null> {
    if (level < this.config.thresholds.audioThreshold) return null;

    // Determine severity based on audio pattern
    let severity: AlertSeverity = 'warning';
    const pattern = options.pattern?.toLowerCase();
    if (pattern?.includes('crying') || pattern?.includes('scream')) {
      severity = 'critical';
    } else if (pattern?.includes('bark') || pattern?.includes('alarm')) {
      severity = 'warning';
    }

    return this.createAlert('audio', severity, {
      streamId: options.streamId,
      metadata: { level, pattern: options.pattern },
    });
  }

  async handlePersonDetection(
    count: number,
    confidence: number,
    options: { streamId?: string; detections?: any[] } = {}
  ): Promise<LocalAlert | null> {
    if (confidence < this.config.thresholds.personConfidence) return null;

    const maxAllowed = this.config.thresholds.maxAllowedPersons;

    // Intrusion detection
    if (maxAllowed > 0 && count > maxAllowed) {
      return this.createAlert('intrusion', 'critical', {
        streamId: options.streamId,
        metadata: { count, allowed: maxAllowed, detections: options.detections },
      });
    }

    // Regular person detection (info level)
    return this.createAlert('person', 'info', {
      streamId: options.streamId,
      metadata: { count, confidence, detections: options.detections },
    });
  }

  async handleAnimalDetection(
    animalType: string,
    confidence: number,
    options: { streamId?: string; dangerLevel?: string; bbox?: number[] } = {}
  ): Promise<LocalAlert | null> {
    if (confidence < this.config.thresholds.animalConfidence) return null;

    const dangerLevel = options.dangerLevel || 'none';
    const isDangerous = dangerLevel === 'high' || dangerLevel === 'extreme';

    if (isDangerous) {
      return this.createAlert('dangerous-animal', 'emergency', {
        streamId: options.streamId,
        metadata: { type: animalType, confidence, dangerLevel, bbox: options.bbox },
      });
    }

    return this.createAlert('animal', 'info', {
      streamId: options.streamId,
      metadata: { type: animalType, confidence, bbox: options.bbox },
    });
  }

  async handleSubjectMatch(
    subjectId: string,
    subjectName: string,
    confidence: number,
    options: { streamId?: string } = {}
  ): Promise<LocalAlert | null> {
    return this.createAlert('subject-match', 'info', {
      streamId: options.streamId,
      metadata: { subjectId, name: subjectName, confidence },
    });
  }

  async handleInactivity(
    minutes: number,
    options: { streamId?: string } = {}
  ): Promise<LocalAlert | null> {
    if (minutes < this.config.thresholds.inactivityTimeout) return null;

    const severity: AlertSeverity = minutes > 60 ? 'critical' : 'warning';
    return this.createAlert('inactivity', severity, {
      streamId: options.streamId,
      metadata: { minutes },
    });
  }

  // ---------------------------------------------------------------------------
  // Inactivity Monitoring
  // ---------------------------------------------------------------------------

  startInactivityMonitor(streamId?: string): void {
    this.resetInactivityTimer(streamId);
  }

  resetInactivityTimer(streamId?: string): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    const timeout = this.config.thresholds.inactivityTimeout * 60 * 1000;
    this.inactivityTimer = setTimeout(() => {
      this.handleInactivity(this.config.thresholds.inactivityTimeout, { streamId });
    }, timeout);
  }

  stopInactivityMonitor(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Alert Management
  // ---------------------------------------------------------------------------

  async acknowledgeAlert(alertId: string): Promise<void> {
    // Update in IndexedDB
    const alerts = await getCachedAlerts(undefined, useAuthStore.getState().profile?.id || '');
    const alert = alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date().toISOString();
      await cacheAlert(alert);
    }
  }

  async getRecentAlerts(limit = 50): Promise<LocalAlert[]> {
    const cached = await getCachedAlerts(undefined, useAuthStore.getState().profile?.id || '');
    return cached.slice(0, limit).map((a) => ({
      id: a.id,
      type: this.inferAlertType(a.message),
      severity: a.severity as AlertSeverity,
      message: a.message,
      description: a.description,
      timestamp: new Date(a.createdAt).getTime(),
      acknowledged: a.acknowledged,
      acknowledgedAt: a.acknowledgedAt,
      streamId: a.streamId,
    }));
  }

  async getUnacknowledgedAlerts(): Promise<LocalAlert[]> {
    const alerts = await this.getRecentAlerts(100);
    return alerts.filter((a) => !a.acknowledged);
  }

  // ---------------------------------------------------------------------------
  // Sound Control
  // ---------------------------------------------------------------------------

  async playAlertSound(severity: AlertSeverity): Promise<void> {
    const sound = SEVERITY_SOUNDS[severity];
    await this.soundManager.playPattern(sound);
  }

  stopSound(): void {
    this.soundManager.stop();
  }

  async testSound(severity: AlertSeverity = 'warning'): Promise<void> {
    await this.playAlertSound(severity);
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  onAlert(callback: (alert: LocalAlert) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(alert: LocalAlert): void {
    this.listeners.forEach((cb) => {
      try {
        cb(alert);
      } catch (error) {
        console.error('[LocalAlertEngine] Listener error:', error);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private shouldTriggerAlert(type: AlertType): boolean {
    const lastTime = this.lastAlerts.get(type);
    if (!lastTime) return true;

    const cooldown = this.config.thresholds.alertCooldown * 1000;
    return Date.now() - lastTime >= cooldown;
  }

  private calculateSeverity(level: number, threshold: number): AlertSeverity {
    const ratio = level / threshold;
    if (ratio >= 2.0) return 'emergency';
    if (ratio >= 1.5) return 'critical';
    if (ratio >= 1.2) return 'warning';
    return 'info';
  }

  private inferAlertType(message: string): AlertType {
    const lower = message.toLowerCase();
    if (lower.includes('motion')) return 'motion';
    if (lower.includes('audio') || lower.includes('sound')) return 'audio';
    if (lower.includes('intrusion')) return 'intrusion';
    if (lower.includes('dangerous') && lower.includes('animal')) return 'dangerous-animal';
    if (lower.includes('animal')) return 'animal';
    if (lower.includes('person')) return 'person';
    if (lower.includes('inactivity')) return 'inactivity';
    if (lower.includes('match') || lower.includes('subject')) return 'subject-match';
    return 'system';
  }

  private async showNotification(alert: LocalAlert): Promise<void> {
    try {
      await getNotificationManager().show(alert.message, {
        body: alert.description,
        tag: alert.id,
        requireInteraction: alert.severity === 'critical' || alert.severity === 'emergency',
        data: {
          alertId: alert.id,
          type: alert.type,
          severity: alert.severity,
        },
      });
    } catch (error) {
      console.warn('[LocalAlertEngine] Failed to show notification:', error);
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const localAlertEngine = new LocalAlertEngine();

// =============================================================================
// React Hook
// =============================================================================

import { useEffect, useState, useCallback } from 'react';

export interface UseLocalAlertsReturn {
  alerts: LocalAlert[];
  unacknowledgedCount: number;
  acknowledgeAlert: (id: string) => Promise<void>;
  acknowledgeAll: () => Promise<void>;
  testSound: (severity?: AlertSeverity) => Promise<void>;
  config: LocalAlertEngineConfig;
  updateConfig: (updates: Partial<LocalAlertEngineConfig>) => Promise<void>;
  updateThresholds: (updates: Partial<AlertThresholds>) => Promise<void>;
}

export function useLocalAlerts(): UseLocalAlertsReturn {
  const [alerts, setAlerts] = useState<LocalAlert[]>([]);
  const [config, setConfig] = useState<LocalAlertEngineConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    // Initialize engine
    localAlertEngine.initialize();

    // Load initial alerts
    localAlertEngine.getRecentAlerts().then(setAlerts);
    setConfig(localAlertEngine.getConfig());

    // Subscribe to new alerts
    const unsubscribe = localAlertEngine.onAlert((alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 100));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const acknowledgeAlert = useCallback(async (id: string) => {
    await localAlertEngine.acknowledgeAlert(id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  }, []);

  const acknowledgeAll = useCallback(async () => {
    const unack = alerts.filter((a) => !a.acknowledged);
    for (const alert of unack) {
      await localAlertEngine.acknowledgeAlert(alert.id);
    }
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
  }, [alerts]);

  const testSound = useCallback(async (severity: AlertSeverity = 'warning') => {
    await localAlertEngine.testSound(severity);
  }, []);

  const updateConfig = useCallback(async (updates: Partial<LocalAlertEngineConfig>) => {
    await localAlertEngine.updateConfig(updates);
    setConfig(localAlertEngine.getConfig());
  }, []);

  const updateThresholds = useCallback(async (updates: Partial<AlertThresholds>) => {
    await localAlertEngine.updateThresholds(updates);
    setConfig(localAlertEngine.getConfig());
  }, []);

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  return {
    alerts,
    unacknowledgedCount,
    acknowledgeAlert,
    acknowledgeAll,
    testSound,
    config,
    updateConfig,
    updateThresholds,
  };
}

export default localAlertEngine;

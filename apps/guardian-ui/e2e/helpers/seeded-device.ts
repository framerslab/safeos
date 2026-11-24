/**
 * A device that has finished setup, for the browser walks: the camera and
 * microphone allowed, the two cards that appear unasked put away, and the
 * saved settings given (or none, for a fresh device).
 *
 * @module e2e/helpers/seeded-device
 */

import type { BrowserContext } from '@playwright/test';

/** The Maximum preset's values, saved as the person's own setting. */
export const OWN_SETTING = {
  id: 'custom',
  name: 'Maximum Alert',
  description: 'High sensitivity (80%) and max volume.',
  motionSensitivity: 80,
  audioSensitivity: 80,
  pixelThreshold: 20,
  absolutePixelThreshold: 50,
  analysisInterval: 5,
  alertDelay: 30,
  alertVolume: 100,
  emergencyMode: false,
  pixelDetectionEnabled: false,
  motionDetectionEnabled: true,
  audioDetectionEnabled: true,
  processingMode: 'hybrid',
  useAbsoluteThreshold: false,
};

export interface Device {
  /** The use setup chose. */
  use: 'baby' | 'pet' | 'elderly' | 'security';
  /** The saved settings (merged over the store's defaults), or none. */
  settings?: Record<string, unknown> | null;
  /** Set times saved on Quiet hours, or none. */
  schedules?: Record<string, unknown> | null;
}

export async function setUpDevice(context: BrowserContext, device: Device): Promise<void> {
  await context.grantPermissions(['camera', 'microphone']);
  await context.addInitScript((d: Device) => {
    // Seeded once: a reload or a second page keeps what the walk changed.
    if (localStorage.getItem('safeos-walk-seeded')) return;
    localStorage.setItem('safeos-walk-seeded', 'true');
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: d.use,
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    if (d.settings) localStorage.setItem('safeos-settings', JSON.stringify({ state: d.settings, version: 0 }));
    if (d.schedules) localStorage.setItem('guardian-schedules', JSON.stringify({ state: d.schedules, version: 0 }));
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
    // The device has answered the notice about alert pictures, so a watch starts at its key.
    localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: {
      keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false,
    }, version: 0 }));
  }, device);
}

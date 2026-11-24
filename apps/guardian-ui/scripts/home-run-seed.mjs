// Both media producers open the app as a device that has already finished setup.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

export const settings = JSON.parse(await readFile(new URL('./home-capture-settings.json', import.meta.url), 'utf8'));

export function launchSampleDevice(video, audio, channel, scale) {
  return chromium.launch({
    channel,
    args: [
      ...(scale ? [`--force-device-scale-factor=${scale}`] : []),
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${path.resolve(video)}`,
      `--use-file-for-fake-audio-capture=${path.resolve(audio)}`,
    ],
  });
}

export async function seededContext(browser, options) {
  const context = await browser.newContext({
    ...options,
    permissions: ['camera', 'microphone', 'notifications'],
  });
  await context.addInitScript(({ settings, look }) => {
    if (window.top !== window) return;
    sessionStorage.setItem('safeos-window-storage', 'kept');
    if (localStorage.getItem('safeos-capture-seeded')) return;
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true,
      selectedScenario: 'pet',
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
    localStorage.setItem('safeos-settings', JSON.stringify({ state: settings, version: 0 }));
    localStorage.setItem('guardian-theme', JSON.stringify({ state: { themeMode: look, resolvedTheme: look }, version: 0 }));
    localStorage.setItem('safeos-notification-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-pwa-prompt-dismissed', String(Date.now()));
    localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: {
      keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false,
    }, version: 0 }));
    localStorage.setItem('safeos-capture-seeded', 'true');
  }, { settings, look: options.colorScheme });
  return context;
}

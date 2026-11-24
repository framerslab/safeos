// Both media producers open the app as a device that has already finished setup.
import path from 'node:path';
import { chromium } from '@playwright/test';

import { CAPTURE_SETTINGS as settings, seededContext as seedWatchedDevice } from './lost-found-walk.mjs';

export { settings };
export const recordingSettings = {
  ...settings,
  globalSettings: {
    ...settings.globalSettings,
    description: 'High sensitivity and maximum volume.',
    motionSensitivity: 87,
  },
};

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

export async function seededContext(browser, options, preset = settings) {
  const context = await seedWatchedDevice(browser, {
    ...options,
    permissions: ['camera', 'microphone', 'notifications'],
  }, preset);
  await context.addInitScript(() => {
    if (window.top === window) sessionStorage.setItem('safeos-window-storage', 'kept');
  });
  return context;
}

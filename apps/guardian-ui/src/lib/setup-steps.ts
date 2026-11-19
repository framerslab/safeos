/**
 * Setup's steps
 *
 * The one list of the steps setup walks, in order. The setup page shows them,
 * and the home page reads the count and the step that asks for the camera
 * from here, so the two cannot differ. It also holds the setting each use
 * applies, since a page file exports its page alone.
 *
 * @module lib/setup-steps
 */

import type { PresetId } from '@/stores/settings-store';

export type SetupStep = 'welcome' | 'disclaimer' | 'scenario' | 'permissions' | 'notifications' | 'complete';

export const SETUP_STEPS: SetupStep[] = ['welcome', 'disclaimer', 'scenario', 'permissions', 'notifications', 'complete'];

/** How many steps setup has. */
export const SETUP_STEP_COUNT = SETUP_STEPS.length;

/** The step at which the browser asks for the camera and microphone, counted from 1. */
export const SETUP_CAMERA_STEP = SETUP_STEPS.indexOf('permissions') + 1;

/**
 * The setting each use applies, as the first-visit wizard applied it. Every
 * use watches with Motion and sound; none chooses a way.
 */
export type SetupUse = 'pet' | 'baby' | 'elderly' | 'security';

/** The Motion and sound setting each use of setup applies. */
export const USE_SETTING: Readonly<Record<SetupUse, PresetId>> = {
  baby: 'infant_sleep',
  pet: 'pet_sleep',
  elderly: 'maximum',
  security: 'night',
};

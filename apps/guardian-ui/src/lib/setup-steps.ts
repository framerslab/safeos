/**
 * Setup's steps
 *
 * The one list of the steps setup walks, in order. The setup page shows them,
 * and the home page reads the count and the step that asks for the camera
 * from here, so the two cannot differ.
 *
 * @module lib/setup-steps
 */

export type SetupStep = 'welcome' | 'disclaimer' | 'scenario' | 'permissions' | 'notifications' | 'complete';

export const SETUP_STEPS: SetupStep[] = ['welcome', 'disclaimer', 'scenario', 'permissions', 'notifications', 'complete'];

/** How many steps setup has. */
export const SETUP_STEP_COUNT = SETUP_STEPS.length;

/** The step at which the browser asks for the camera and microphone, counted from 1. */
export const SETUP_CAMERA_STEP = SETUP_STEPS.indexOf('permissions') + 1;

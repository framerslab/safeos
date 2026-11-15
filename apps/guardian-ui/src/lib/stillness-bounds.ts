/**
 * Bounds of the stillness alert
 *
 * The monitor can alert when nothing has moved for a set time. The setting's
 * slider and the home page both read its shortest and longest time from here.
 *
 * @module lib/stillness-bounds
 */

/** The shortest time of stillness a person can set, in minutes. */
export const STILLNESS_ALERT_MIN_MINUTES = 1;

/** The longest time of stillness a person can set, in minutes. */
export const STILLNESS_ALERT_MAX_MINUTES = 60;

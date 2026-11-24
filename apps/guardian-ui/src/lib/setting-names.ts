/**
 * The settings, named for what they do
 *
 * Each stored setting id keeps its value in `safeos-settings`; these are the
 * names every settings page shows for them, in the order they are offered.
 *
 * @module lib/setting-names
 */

import type { PresetId } from '../stores/settings-store';

/** The order the settings are offered in. */
export const SETTING_ORDER: readonly PresetId[] = [
  'maximum',
  'night',
  'silent',
  'infant_sleep',
  'pet_sleep',
  'ultimate',
  'deep_sleep_minimal',
  'custom',
];

export const SETTING_NAMES: Record<PresetId, string> = {
  maximum: 'Standard',
  night: 'Night',
  silent: 'Silent',
  infant_sleep: 'Sleeping baby',
  pet_sleep: 'Sleeping pet',
  ultimate: 'Very sensitive',
  deep_sleep_minimal: 'Smallest movement',
  custom: 'Your own',
};

/** The name of a stored setting id; an id this build does not know reads "Your own". */
export function settingName(id: string | null | undefined): string {
  if (id && Object.prototype.hasOwnProperty.call(SETTING_NAMES, id)) return SETTING_NAMES[id as PresetId];
  return SETTING_NAMES.custom;
}

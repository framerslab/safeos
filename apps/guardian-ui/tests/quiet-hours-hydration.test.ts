/** @jest-environment jsdom */
import { hydrateSavedSettings } from '@/lib/settings-hydration';
import { useSettingsStore } from '@/stores/settings-store';
import type { UserProfile } from '@/stores/auth-store';

it.each(['browser', 'account'])('retains chosen quiet-hours days from %s settings', source => {
  localStorage.clear();
  useSettingsStore.getState().resetToDefaults();
  useSettingsStore.setState({ settingsSourceId: null });
  const notificationSettings = { quietHoursStart: '22:00', quietHoursEnd: '07:00',
    quietHoursDays: [1, 3, 5], quietHoursTimeZone: 'America/Los_Angeles' };
  if (source === 'browser') localStorage.setItem('safeos_user_settings', JSON.stringify({ notificationSettings }));
  hydrateSavedSettings(source === 'browser' ? null : { id: 'owner', notificationSettings } as UserProfile);
  expect(useSettingsStore.getState().quietHoursSettings.days).toEqual([1, 3, 5]);
});

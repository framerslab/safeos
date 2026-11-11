import type { UserProfile } from '../stores/auth-store';
import { useSettingsStore, type SecurityPreset } from '../stores/settings-store';

/** Import older account/browser preferences once, then use the shared store. */
export function hydrateSavedSettings(profile: UserProfile | null): void {
  const state = useSettingsStore.getState();
  const sourceId = profile ? `account:${profile.id}` : 'browser';
  if (state.settingsSourceId === sourceId || (!profile && state.settingsSourceId)) return;

  let saved: Pick<UserProfile, 'preferences' | 'notificationSettings'> | null = profile;
  if (!saved && typeof localStorage !== 'undefined') {
    try {
      saved = JSON.parse(localStorage.getItem('safeos_user_settings') || 'null');
    } catch { /* Ignore unreadable legacy preferences. */ }
  }
  if (!saved) return;

  const values: Partial<SecurityPreset> = {};
  for (const key of ['motionSensitivity', 'audioSensitivity', 'alertVolume'] as const) {
    const value = saved.preferences?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) values[key] = Math.max(0, Math.min(100, value * 100));
  }
  const notification = saved.notificationSettings;
  useSettingsStore.setState({
    settingsSourceId: sourceId,
    globalSettings: { ...state.globalSettings, ...values },
    quietHoursSettings: notification ? {
      ...state.quietHoursSettings,
      enabled: !!(notification.quietHoursStart && notification.quietHoursEnd),
      startTime: notification.quietHoursStart ?? state.quietHoursSettings.startTime,
      endTime: notification.quietHoursEnd ?? state.quietHoursSettings.endTime,
    } : state.quietHoursSettings,
  });
}

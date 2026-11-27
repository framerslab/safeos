import type { UserProfile } from '../stores/auth-store';
import { useSettingsStore, type SecurityPreset } from '../stores/settings-store';
import { setTimeSettingInForce } from './schedule-manager';

type SavedSettings = Partial<Pick<UserProfile, 'preferences' | 'notificationSettings'>>;

const PREFERENCE_KEYS = ['motionSensitivity', 'audioSensitivity', 'alertVolume'] as const;

/**
 * Every new session's profile starts with these values (client guest sessions and
 * the server's session route alike). They record no choice by the person, so they
 * never replace the settings already in effect.
 */
const NEW_PROFILE_PREFERENCES: Record<(typeof PREFERENCE_KEYS)[number], number> = {
  motionSensitivity: 0.5,
  audioSensitivity: 0.5,
  alertVolume: 0.7,
};

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Older versions of Settings wrote this record on each save on this browser. */
function readBrowserSettings(): SavedSettings | null {
  try {
    // A browser that gives the site no storage throws on this first read.
    if (typeof localStorage === 'undefined') return null;
    return JSON.parse(localStorage.getItem('safeos_user_settings') || 'null');
  } catch {
    return null; // Unreadable older preferences are ignored.
  }
}

/**
 * Import preferences a person saved before the shared store held them, once per
 * account (or once for the browser), then use the shared store. A value saved on
 * this browser wins, and is read only by the first import; an account value is
 * used only when it differs from a new profile's default; account quiet hours
 * only when both times are set. While a
 * set time's setting is on, the sensitivities and the volume stay the set
 * time's: the import is recorded as done, and quiet hours are taken.
 */
export function hydrateSavedSettings(profile: UserProfile | null): void {
  const state = useSettingsStore.getState();
  const sourceId = profile ? `account:${profile.id}` : 'browser';
  if (state.settingsSourceId === sourceId || (!profile && state.settingsSourceId)) return;

  const browser = readBrowserSettings();
  if (!profile && !browser) return;
  // The browser's record is imported once. After that the shared store holds
  // every change, and the record is never written again: a value it holds
  // keeps the store's own, so a later profile cannot bring an old value back.
  const imported = state.settingsSourceId !== null;

  const values: Partial<SecurityPreset> = {};
  for (const key of PREFERENCE_KEYS) {
    const saved = browser?.preferences?.[key];
    const account = profile?.preferences?.[key];
    const value = isNumber(saved) ? (imported ? undefined : saved)
      : isNumber(account) && account !== NEW_PROFILE_PREFERENCES[key] ? account
        : undefined;
    if (value !== undefined) values[key] = Math.max(0, Math.min(100, value * 100));
  }

  let quietHoursSettings = state.quietHoursSettings;
  const savedQuiet = browser?.notificationSettings;
  const accountQuiet = profile?.notificationSettings;
  if (savedQuiet && imported) {
    // Imported before: the store's quiet hours stay.
  } else if (savedQuiet) {
    quietHoursSettings = {
      ...quietHoursSettings,
      enabled: !!(savedQuiet.quietHoursStart && savedQuiet.quietHoursEnd),
      startTime: savedQuiet.quietHoursStart ?? quietHoursSettings.startTime,
      endTime: savedQuiet.quietHoursEnd ?? quietHoursSettings.endTime,
      days: savedQuiet.quietHoursDays ?? quietHoursSettings.days,
    };
  } else if (accountQuiet?.quietHoursStart && accountQuiet.quietHoursEnd) {
    quietHoursSettings = {
      ...quietHoursSettings,
      enabled: true,
      startTime: accountQuiet.quietHoursStart,
      endTime: accountQuiet.quietHoursEnd,
      days: accountQuiet.quietHoursDays ?? quietHoursSettings.days,
    };
  }

  // A set time's setting that is on goes on over the imported sensitivities and volume, as it does
  // over the preferences read when the app opens: an account restored after the set time began
  // leaves the watch at the set time's values.
  const heldBySetTime = setTimeSettingInForce() !== null;
  useSettingsStore.setState({
    settingsSourceId: sourceId,
    globalSettings: heldBySetTime ? state.globalSettings : { ...state.globalSettings, ...values },
    quietHoursSettings,
  });
}

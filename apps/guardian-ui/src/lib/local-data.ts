/** Local data shared by the privacy controls and account sign-out. */
import { clearClientData } from './client-db';
import { clearCustomSounds } from './custom-sounds-db';
import { getSoundManager } from './sound-manager';
import { useMonitoringStore } from '../stores/monitoring-store';
import { useSecurityStore, DEFAULT_SECURITY_SETTINGS } from '../stores/security-store';
import { useLostFoundStore, DEFAULT_SETTINGS as DEFAULT_LOST_FOUND_SETTINGS } from '../stores/lost-found-store';
import { useAnimalAlertStore, DEFAULT_ANIMAL_SETTINGS } from '../stores/animal-alert-store';
import { useSettingsStore } from '../stores/settings-store';
import { useScheduleStore } from './schedule-manager';
import { useThemeStore } from './theme-manager';
import { useOnboardingStore } from '../stores/onboarding-store';

export async function clearLocalData(options: { preserveBackendConfig?: boolean } = {}): Promise<void> {
  // Stop producers before clearing their records and persisted state.
  getSoundManager().stopAll();
  getSoundManager().stopCustomSounds();
  useScheduleStore.setState({ schedules: [], activeScheduleId: null, schedulingEnabled: true });
  useThemeStore.getState().setThemeMode('system');
  useThemeStore.getState().resetAccessibility();
  useMonitoringStore.getState().reset();
  useSecurityStore.getState().reset();
  useSecurityStore.getState().clearIntrusionHistory();
  useSecurityStore.setState({ settings: DEFAULT_SECURITY_SETTINGS, totalIntrusionEvents: 0, lastIntrusionTime: null });
  useLostFoundStore.getState().reset();
  useLostFoundStore.setState({ subjects: [], settings: DEFAULT_LOST_FOUND_SETTINGS });
  useAnimalAlertStore.getState().reset();
  useAnimalAlertStore.getState().clearHistory();
  useAnimalAlertStore.setState({ settings: DEFAULT_ANIMAL_SETTINGS });
  useSettingsStore.getState().resetToDefaults();
  useOnboardingStore.getState().reset();

  await Promise.all([clearClientData(), clearCustomSounds()]);
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('safeos')).map((name) => caches.delete(name)));
  }
  for (const storage of [localStorage, sessionStorage]) {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (options.preserveBackendConfig && key === 'safeos_backend_config') continue;
      if (key?.startsWith('safeos') || key === 'guardian-schedules' || key === 'guardian-theme') storage.removeItem(key);
    }
  }
}

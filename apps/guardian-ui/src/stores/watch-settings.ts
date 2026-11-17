'use client';

/**
 * What the watch runs at for its use, and the one way every watch control
 * moves it. The Monitor page, its Sensitivity panel and Quick Settings read the
 * values here and write through tuneWatch, so a control always shows the value
 * the watch runs at and moves it where that value comes from.
 */

import { useCallback, useMemo } from 'react';
import { effectiveSettings, useSettingsStore, type SecurityPreset } from './settings-store';
import { useOnboardingStore } from './onboarding-store';
import { useMonitoringStore } from './monitoring-store';

export function useWatchSettings() {
  const globalSettings = useSettingsStore((state) => state.globalSettings);
  const scenarioOverrides = useSettingsStore((state) => state.scenarioOverrides);
  const tuneScenario = useSettingsStore((state) => state.tuneScenario);
  const resetScenarioToPreset = useSettingsStore((state) => state.resetScenarioToPreset);
  const selectedScenario = useOnboardingStore((state) => state.selectedScenario);
  const monitoringScenario = useMonitoringStore((state) => state.scenario);
  const watchUse = selectedScenario || monitoringScenario || null;

  const watchSettings = useMemo(
    () => effectiveSettings(globalSettings, scenarioOverrides, watchUse),
    [globalSettings, scenarioOverrides, watchUse],
  );
  // A Motion or Audio set for the use on Settings > Detection moves there; every other value moves the preset.
  const tuneWatch = useCallback(
    (changes: Partial<SecurityPreset>) => tuneScenario(watchUse, changes),
    [tuneScenario, watchUse],
  );
  // The preset's values, and nothing set for the use on Detection.
  const resetWatch = useCallback(() => resetScenarioToPreset(watchUse), [resetScenarioToPreset, watchUse]);

  return { watchUse, watchSettings, tuneWatch, resetWatch };
}

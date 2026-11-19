/**
 * The volume an alert plays at, by its level, during quiet hours.
 *
 * The rule is pure: quiet hours off, Silent, Reduced and Emergency Only, each
 * against the five alert levels. In Emergency Only a critical alert plays at
 * the alert volume and every other level plays at 0.
 */
import { alertVolumeFor, type AlertSeverity, type QuietHoursSettings } from '@/stores/settings-store';

const LEVELS: AlertSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
const ALERT_VOLUME = 70;
const REDUCED = 30;

type Mode = 'off' | QuietHoursSettings['mode'];

const inputs = (mode: Mode) => ({
  emergencyModeActive: false,
  globalMute: false,
  quietHoursActive: mode !== 'off',
  quietMode: mode === 'off' ? 'silent' as const : mode,
  reducedVolume: REDUCED,
  alertVolume: ALERT_VOLUME,
});

const EXPECTED: Record<Mode, Record<AlertSeverity, number>> = {
  off: { info: 70, low: 70, medium: 70, high: 70, critical: 70 },
  silent: { info: 0, low: 0, medium: 0, high: 0, critical: 0 },
  reduced: { info: 30, low: 30, medium: 30, high: 30, critical: 30 },
  emergency_only: { info: 0, low: 0, medium: 0, high: 0, critical: 70 },
};

describe('alertVolumeFor', () => {
  for (const mode of Object.keys(EXPECTED) as Mode[]) {
    for (const level of LEVELS) {
      it(`plays a ${level} alert at ${EXPECTED[mode][level]} with quiet hours ${mode}`, () => {
        expect(alertVolumeFor(inputs(mode), level)).toBe(EXPECTED[mode][level]);
      });
    }
  }

  it('reads an alert with no level as one that is not critical', () => {
    expect(alertVolumeFor(inputs('emergency_only'))).toBe(0);
    expect(alertVolumeFor(inputs('off'))).toBe(ALERT_VOLUME);
  });

  it('plays every level at 0 under the mute, and at 100 in emergency mode', () => {
    for (const level of LEVELS) {
      expect(alertVolumeFor({ ...inputs('emergency_only'), globalMute: true }, level)).toBe(0);
      expect(alertVolumeFor({ ...inputs('silent'), globalMute: true, emergencyModeActive: true }, level)).toBe(100);
    }
  });
});

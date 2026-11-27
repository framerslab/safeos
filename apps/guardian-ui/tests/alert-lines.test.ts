/** @jest-environment node */
/**
 * Where setup draws each bar's line
 *
 * Each line stands where the watch will alert once setup ends with the
 * answer shown chosen: 100 less the sensitivity of the setting the watch
 * reads for that use, with the Motion and Audio set for it on Detection laid
 * over the preset as the watch lays them.
 */

import { alertLines, linesOf } from '@/lib/alert-lines';
import { DEFAULT_PRESETS, effectiveSettings, type ScenarioOverrides } from '@/stores/settings-store';

describe("where setup draws each bar's line", () => {
  it('puts each line at 100 less its sensitivity', () => {
    expect(linesOf({ motionSensitivity: 98, audioSensitivity: 95, audioDetectionEnabled: true })).toEqual({ motion: 2, sound: 5 });
  });

  it('draws no sound line where the setting raises no sound alert', () => {
    expect(linesOf(DEFAULT_PRESETS.pet_sleep).sound).toBeNull();
  });

  it.each([
    ['pet', { motion: 10, sound: null }],
    ['baby', { motion: 2, sound: 5 }],
    ['elderly', { motion: 20, sound: 20 }],
    ['security', { motion: 60, sound: 40 }],
  ] as const)('puts the lines of the %s use', (use, lines) => {
    expect(alertLines(use, null, DEFAULT_PRESETS.maximum, {}, null)).toEqual(lines);
  });

  it("keeps the device's own setting for no use and for the use the device has", () => {
    const saved = { ...DEFAULT_PRESETS.infant_sleep, motionSensitivity: 60 };
    expect(alertLines(null, null, saved, {}, null)).toEqual({ motion: 40, sound: 5 });
    expect(alertLines('baby', 'baby', saved, {}, 'baby')).toEqual({ motion: 40, sound: 5 });
  });

  it('puts the lines where the watch alerts for a use whose Motion is set on Detection', () => {
    const overrides: ScenarioOverrides = { baby: { motionSensitivity: 60 } };
    const lines = alertLines('baby', 'baby', DEFAULT_PRESETS.infant_sleep, overrides, 'baby');
    expect(lines).toEqual({ motion: 40, sound: 5 });
    expect(lines).toEqual(linesOf(effectiveSettings(DEFAULT_PRESETS.infant_sleep, overrides, 'baby')));
    expect(
      alertLines('baby', 'baby', DEFAULT_PRESETS.infant_sleep, { baby: { motionSensitivity: 60, audioSensitivity: 55 } }, 'baby')
    ).toEqual({ motion: 40, sound: 45 });
  });

  it("lays a use's Detection values over the preset the last key applies", () => {
    expect(alertLines('baby', 'pet', DEFAULT_PRESETS.pet_sleep, { baby: { motionSensitivity: 60 } }, 'pet')).toEqual({
      motion: 40,
      sound: 5,
    });
  });

  it("keeps the preset for a use with nothing set, or with Reset's null", () => {
    expect(alertLines('baby', 'baby', DEFAULT_PRESETS.infant_sleep, { pet: { motionSensitivity: 60 } }, 'baby')).toEqual({
      motion: 2,
      sound: 5,
    });
    const reset = { baby: null } as unknown as ScenarioOverrides;
    expect(alertLines('baby', 'baby', DEFAULT_PRESETS.infant_sleep, reset, 'baby')).toEqual({ motion: 2, sound: 5 });
  });

  it('draws no motion line where the setting has motion alerts off, as the watch raises none', () => {
    // The input: the device's own setting with motion alerts off, at a motion sensitivity of 60.
    const saved = { ...DEFAULT_PRESETS.infant_sleep, motionSensitivity: 60, motionDetectionEnabled: false };
    expect(alertLines(null, null, saved, {}, null)).toEqual({ motion: null, sound: 5 });
    expect(alertLines('baby', 'baby', saved, {}, 'baby')).toEqual({ motion: null, sound: 5 });
    expect(alertLines('pet', 'baby', saved, {}, 'baby').motion).toBe(10);
  });

  it('reads the use the watch reads when no use is shown chosen', () => {
    expect(alertLines(null, null, DEFAULT_PRESETS.maximum, { security: { motionSensitivity: 50 } }, 'security')).toEqual({
      motion: 50,
      sound: 20,
    });
  });
});

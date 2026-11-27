/** @jest-environment jsdom */
/**
 * What setup's last key writes
 *
 * The last key writes every answer of a run again, a use's setting only when
 * the use changes, the saved choice of Lost and Found on every run, and the
 * way the dashboard's start reads when A lost pet is the answer, then marks
 * setup complete, last. A refused write throws nothing.
 */

import { finishSetup, NO_ANSWERS, writeNow } from '@/lib/setup-answers';
import { readLastWay, rememberWay } from '@/lib/watch-session';
import { forgetStorageFull, lastWriteRefused } from '@/lib/storage-full';
import { forgetVisit } from '@/lib/visit-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useCameraStore } from '@/stores/camera-store';

const refused = (name: string) => () => {
  throw new DOMException(name, name === 'denied' ? 'SecurityError' : 'QuotaExceededError');
};
const stored = (call: unknown[]) => JSON.parse(String(call[1])) as { state: Record<string, unknown> };
const callsFor = (writes: jest.SpyInstance, key: string) => writes.mock.calls.filter((call) => call[0] === key);

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  useSettingsStore.getState().resetToDefaults();
  useCameraStore.getState().setDeviceId('');
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  forgetStorageFull();
  forgetVisit();
});

describe("what setup's last key writes", () => {
  it('writes every answer of a run again, then marks setup complete', () => {
    useOnboardingStore.setState({
      isComplete: false,
      selectedScenario: 'pet',
      lostFoundChosen: true,
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    });
    useCameraStore.getState().setDeviceId('usb');
    const writes = jest.spyOn(localStorage, 'setItem');
    expect(
      finishSetup({ statement: true, use: 'baby', camera: true, microphone: false, defaultCamera: true, lostFound: false }, 'again', 'pet')
    ).toBe(true);
    const state = useOnboardingStore.getState();
    expect(state.isComplete).toBe(true);
    expect(state.selectedScenario).toBe('baby');
    expect(state.lostFoundChosen).toBe(false);
    expect(state.cameraPermissionGranted).toBe(true);
    expect(state.microphonePermissionGranted).toBe(false);
    expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
    expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(98);
    expect(useCameraStore.getState().deviceId).toBe('');

    const calls = writes.mock.calls;
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('safeos-onboarding');
    expect(stored(last).state.isComplete).toBe(true);
    callsFor(writes, 'safeos-onboarding')
      .slice(0, -1)
      .forEach((call) => expect(stored(call).state.isComplete).toBe(false));
    const lastAt = calls.length - 1;
    for (const key of ['safeos-settings', 'safeos-camera']) {
      const at = calls.findIndex((call) => call[0] === key);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(lastAt);
    }
  });

  it('keeps a tuned setting when a run again keeps the use', () => {
    useOnboardingStore.setState({ isComplete: true, selectedScenario: 'pet' });
    useSettingsStore.getState().setActivePreset('pet_sleep');
    useSettingsStore.getState().updateGlobalSettings({ motionSensitivity: 33 });
    finishSetup({ ...NO_ANSWERS, use: 'pet' }, 'again', 'pet');
    expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(33);
    expect(useSettingsStore.getState().activePresetId).toBe('custom');
  });

  it("keeps the statement's time from the first step on a first setup", () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T10:00:00Z'));
    writeNow({ statement: true });
    jest.setSystemTime(new Date('2026-11-15T10:05:00Z'));
    expect(finishSetup({ ...NO_ANSWERS, statement: true, use: 'pet' }, 'first', null)).toBe(true);
    expect(useOnboardingStore.getState().disclaimerAcceptedAt).toBe('2026-11-15T10:00:00.000Z');
    expect(useOnboardingStore.getState().isComplete).toBe(true);
  });

  it('writes a use the page chose for a first setup, with its setting', () => {
    finishSetup({ ...NO_ANSWERS, use: 'security' }, 'first', null);
    expect(useOnboardingStore.getState().selectedScenario).toBe('security');
    expect(useSettingsStore.getState().activePresetId).toBe('night');
  });

  it('leaves the saved camera alone unless Use the default camera was pressed', () => {
    useCameraStore.getState().setDeviceId('usb');
    finishSetup({ ...NO_ANSWERS, use: 'pet' }, 'again', 'pet');
    expect(useCameraStore.getState().deviceId).toBe('usb');
  });

  it('saves A lost pet as the pet use with Lost and Found chosen', () => {
    const writes = jest.spyOn(localStorage, 'setItem');
    expect(finishSetup({ ...NO_ANSWERS, statement: true, use: 'pet', lostFound: true }, 'first', null)).toBe(true);
    const state = useOnboardingStore.getState();
    expect(state.selectedScenario).toBe('pet');
    expect(useSettingsStore.getState().activePresetId).toBe('pet_sleep');
    expect(state.lostFoundChosen).toBe(true);
    expect(state.isComplete).toBe(true);
    const onboarding = callsFor(writes, 'safeos-onboarding');
    const last = onboarding[onboarding.length - 1];
    expect(stored(last).state.lostFoundChosen).toBe(true);
    expect(stored(last).state.isComplete).toBe(true);
    onboarding.slice(0, -1).forEach((call) => expect(stored(call).state.isComplete).toBe(false));
  });

  it("keeps a device's own use when A lost pet is shown chosen over it", () => {
    useOnboardingStore.setState({ isComplete: true, selectedScenario: 'baby', lostFoundChosen: true });
    useSettingsStore.getState().setActivePreset('infant_sleep');
    useSettingsStore.getState().updateGlobalSettings({ motionSensitivity: 60 });
    finishSetup({ ...NO_ANSWERS, use: 'baby', lostFound: true }, 'again', 'baby');
    expect(useOnboardingStore.getState().selectedScenario).toBe('baby');
    expect(useOnboardingStore.getState().lostFoundChosen).toBe(true);
    expect(useSettingsStore.getState().globalSettings.motionSensitivity).toBe(60);
    expect(useSettingsStore.getState().activePresetId).toBe('custom');
  });

  it('writes Lost and Found as not chosen when another answer is the one chosen', () => {
    useOnboardingStore.setState({ isComplete: true, selectedScenario: 'pet', lostFoundChosen: true });
    finishSetup({ ...NO_ANSWERS, use: 'pet', lostFound: false }, 'again', 'pet');
    expect(useOnboardingStore.getState().lostFoundChosen).toBe(false);
    expect(useOnboardingStore.getState().selectedScenario).toBe('pet');
  });

  it("points the dashboard's start at Lost and Found, with no pet, when A lost pet finishes setup", () => {
    const writes = jest.spyOn(localStorage, 'setItem');
    expect(finishSetup({ ...NO_ANSWERS, statement: true, use: 'pet', lostFound: true }, 'first', null)).toBe(true);
    expect(readLastWay()).toEqual({ way: 'lost-found' });
    expect(localStorage.getItem('safeos-last-way')).toBe('{"way":"lost-found"}');
    const calls = writes.mock.calls;
    const way = calls.findIndex((call) => call[0] === 'safeos-last-way');
    const done = calls.length - 1 - [...calls].reverse().findIndex((call) => call[0] === 'safeos-onboarding');
    expect(way).toBeGreaterThanOrEqual(0);
    expect(way).toBeLessThan(done);
    expect(stored(calls[done]).state.isComplete).toBe(true);

    rememberWay('lost-found', 'pet-1');
    finishSetup({ ...NO_ANSWERS, use: 'baby', lostFound: true }, 'again', 'baby');
    expect(readLastWay()).toEqual({ way: 'lost-found' });
  });

  it.each([[null], [{ way: 'security' }], [{ way: 'monitor' }], [{ way: 'lost-found', pet: 'pet-1' }]] as const)(
    'leaves the way last watched as it is when another answer finishes setup (%j)',
    (row) => {
      if (row) rememberWay(row.way, 'pet' in row ? row.pet : undefined);
      finishSetup({ ...NO_ANSWERS, statement: true, use: 'baby' }, 'first', null);
      expect(readLastWay()).toEqual(row);
      if (row === null) expect(localStorage.getItem('safeos-last-way')).toBeNull();
    }
  );

  it('takes back the Lost and Found start an earlier finish left when a later run ends on another answer', () => {
    rememberWay('lost-found');
    finishSetup({ ...NO_ANSWERS, use: 'baby', lostFound: false }, 'again', 'pet');
    expect(readLastWay()).toEqual({ way: 'monitor' });
  });

  it("holds the dashboard's start for the visit when the browser refuses to store it", () => {
    jest.spyOn(localStorage, 'setItem').mockImplementation(refused('full'));
    let answer = true;
    expect(() => {
      answer = finishSetup({ ...NO_ANSWERS, statement: true, use: 'pet', lostFound: true }, 'first', null);
    }).not.toThrow();
    expect(answer).toBe(false);
    expect(readLastWay()).toEqual({ way: 'lost-found' });
    expect(localStorage.getItem('safeos-last-way')).toBeNull();
  });

  it('opens the destination when the browser keeps the setup record and refuses the Motion and sound setting alone', () => {
    const keep = localStorage.setItem.bind(localStorage);
    jest.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'safeos-settings') throw new DOMException('full', 'QuotaExceededError');
      keep(key, value);
    });
    let answer = false;
    expect(() => {
      answer = finishSetup({ ...NO_ANSWERS, statement: true, use: 'baby' }, 'first', null);
    }).not.toThrow();
    expect(answer).toBe(true);
    const record = JSON.parse(localStorage.getItem('safeos-onboarding') ?? '{}') as { state: Record<string, unknown> };
    expect(record.state.isComplete).toBe(true);
    expect(record.state.selectedScenario).toBe('baby');
    expect(useSettingsStore.getState().activePresetId).toBe('infant_sleep');
    expect(lastWriteRefused('safeos-settings')).toBe(true);
  });

  it('names what was not saved when the browser refuses every read and write', () => {
    jest.spyOn(localStorage, 'setItem').mockImplementation(refused('denied'));
    jest.spyOn(localStorage, 'getItem').mockImplementation(refused('denied'));
    let answer = true;
    expect(() => {
      answer = finishSetup({ ...NO_ANSWERS, statement: true, use: 'pet' }, 'first', null);
    }).not.toThrow();
    expect(answer).toBe(false);
    expect(useOnboardingStore.getState().isComplete).toBe(true);
  });

  it('names what was not saved when the browser lets the site reach no storage at all', () => {
    // A browser set to keep no data for the site throws on the first read of
    // localStorage itself, so each store is made with no storage at all and
    // keeps its writes for the visit, throwing nothing.
    const kept = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    let answer = true;
    let complete = false;
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fresh = require('@/lib/setup-answers') as typeof import('@/lib/setup-answers');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const onboarding = require('@/stores/onboarding-store') as typeof import('@/stores/onboarding-store');
        expect(() => {
          answer = fresh.finishSetup({ ...fresh.NO_ANSWERS, statement: true, use: 'pet' }, 'first', null);
        }).not.toThrow();
        complete = onboarding.useOnboardingStore.getState().isComplete;
      });
    } finally {
      if (kept) Object.defineProperty(window, 'localStorage', kept);
    }
    expect(answer).toBe(false);
    expect(complete).toBe(true);
  });
});

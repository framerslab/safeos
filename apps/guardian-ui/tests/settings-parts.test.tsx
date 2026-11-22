/** @jest-environment jsdom */
/**
 * The rows every settings page shares
 *
 * A slider says its value in words and moves with the keys; a change says
 * "Saved" for two seconds, or says it was not saved when the browser refuses
 * its storage, and that stays; a question asked in place takes focus and gives
 * it back on Cancel; a test key says what it plays and reads Stop while it
 * plays; a field keeps what was typed and names its error under it; a row of
 * the list is named by its page and described by its value.
 */

import { useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useSettingsStore } from '@/stores/settings-store';
import { useSaveNote, writeRefused } from '@/lib/settings-save';
import { SliderRow } from '@/components/settings/SliderRow';
import { SavedNote } from '@/components/settings/SavedNote';
import { AskInPlace } from '@/components/settings/ConfirmInPlace';
import { TestKey } from '@/components/settings/TestKey';
import { FieldRow } from '@/components/settings/FieldRow';
import { LinkRow } from '@/components/settings/LinkRow';
import { StorageLine } from '@/components/settings/StorageLine';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** The words an element's aria-describedby names, as a person hears them. */
function descriptionOf(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

function refuseStorage() {
  return jest.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('refused', 'SecurityError');
  });
}

/** A slider that writes the alert volume and says whether the change was kept. */
function VolumeSlider() {
  const volume = useSettingsStore((s) => s.globalSettings.alertVolume);
  const { note, changed } = useSaveNote();
  return (
    <SliderRow
      id="volume"
      name="Alert volume"
      value={volume}
      min={0}
      max={100}
      ends={['Off', 'Loudest']}
      valueText={(v) => `${v} of 100`}
      onChange={(v) => {
        useSettingsStore.getState().updateGlobalSettings({ alertVolume: v });
        changed();
      }}
    >
      <SavedNote note={note} />
    </SliderRow>
  );
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  localStorage.clear();
  useSettingsStore.getState().resetToDefaults();
  useSettingsStore.getState().updateGlobalSettings({ alertVolume: 80 });
});

it("names a slider's value in words and moves it with the keys", () => {
  render(<VolumeSlider />);
  const slider = screen.getByRole('slider', { name: 'Alert volume' });
  expect(slider).toHaveProperty('value', '80');
  expect(slider.getAttribute('aria-valuetext')).toBe('80 of 100');
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(useSettingsStore.getState().globalSettings.alertVolume).toBe(79);
  expect(screen.getByRole('slider', { name: 'Alert volume' }).getAttribute('aria-valuetext')).toBe('79 of 100');
  fireEvent.keyDown(slider, { key: 'PageDown' });
  expect(useSettingsStore.getState().globalSettings.alertVolume).toBe(69);
  fireEvent.keyDown(slider, { key: 'End' });
  expect(useSettingsStore.getState().globalSettings.alertVolume).toBe(100);
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(useSettingsStore.getState().globalSettings.alertVolume).toBe(100);
  fireEvent.keyDown(slider, { key: 'Home' });
  expect(useSettingsStore.getState().globalSettings.alertVolume).toBe(0);
  expect(screen.getByText('Off')).toBeTruthy();
  expect(screen.getByText('Loudest')).toBeTruthy();
});

it('says Saved for two seconds after a change and reads it once', () => {
  jest.useFakeTimers();
  render(<VolumeSlider />);
  const status = screen.getByRole('status');
  expect(status.getAttribute('aria-live')).toBe('polite');
  expect(status.textContent).toBe('');
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Alert volume' }), { key: 'ArrowUp' });
  expect(status.textContent).toBe('Saved');
  act(() => {
    jest.advanceTimersByTime(1999);
  });
  expect(status.textContent).toBe('Saved');
  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(status.textContent).toBe('');
});

it('moves the value and says Not saved when the browser refuses the write', () => {
  jest.useFakeTimers();
  render(<VolumeSlider />);
  refuseStorage();
  expect(writeRefused()).toBe(true);
  expect(() => useSettingsStore.getState().updateGlobalSettings({ alertVolume: 40 })).not.toThrow();
  expect(useSettingsStore.getState().globalSettings.alertVolume).toBe(40);
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Alert volume' }), { key: 'ArrowUp' });
  expect(useSettingsStore.getState().globalSettings.alertVolume).toBe(41);
  expect(screen.getByRole('status').textContent).toBe('Not saved. This browser is not keeping settings.');
  act(() => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByRole('status').textContent).toBe('Not saved. This browser is not keeping settings.');
});

it('says at the top that the browser is not keeping settings, and nothing while it keeps them', () => {
  const { unmount } = render(<StorageLine />);
  expect(screen.queryByText('This browser is not keeping settings. Changes last until you close this tab.')).toBeNull();
  unmount();
  refuseStorage();
  render(<StorageLine />);
  expect(screen.getByRole('status').textContent).toContain(
    'This browser is not keeping settings. Changes last until you close this tab.'
  );
});

it('asks in place, takes focus on the question and gives it back on Cancel', () => {
  const onConfirm = jest.fn();
  const confirmBox = jest.spyOn(window, 'confirm');
  render(
    <AskInPlace
      label="Clear all data on this device"
      question="Clear all data on this device? Alerts, pictures, pets, sounds and settings leave this device."
      confirm="Clear all data"
      onConfirm={onConfirm}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear all data on this device' }));
  const question = screen.getByText(
    'Clear all data on this device? Alerts, pictures, pets, sounds and settings leave this device.'
  );
  expect(document.activeElement).toBe(question);
  expect(screen.queryByRole('button', { name: 'Clear all data on this device' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear all data on this device' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear all data on this device' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(confirmBox).not.toHaveBeenCalled();
});

it('plays and stops a test key named for what it plays', () => {
  function Harness() {
    const [playing, setPlaying] = useState(false);
    return <TestKey label="Alert volume" playing={playing} onPlay={() => setPlaying(true)} onStop={() => setPlaying(false)} />;
  }
  render(<Harness />);
  const play = screen.getByRole('button', { name: 'Play Alert volume' });
  expect(play.textContent).toBe('Play');
  expect(play.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(play);
  const stop = screen.getByRole('button', { name: 'Stop Alert volume' });
  expect(stop.textContent).toBe('Stop');
  expect(stop.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(stop);
  expect(screen.getByRole('button', { name: 'Play Alert volume' })).toBeTruthy();
});

it("keeps what was typed and names a field's error under it", () => {
  function Harness() {
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    return (
      <>
        <FieldRow id="name" label="Your name on your server" value={value} onChange={setValue} error={error} />
        <button type="button" onClick={() => setError('Your name was not saved. Try again.')}>
          Save
        </button>
      </>
    );
  }
  render(<Harness />);
  const field = screen.getByRole('textbox', { name: 'Your name on your server' });
  fireEvent.change(field, { target: { value: 'Robin' } });
  expect(field.getAttribute('aria-invalid')).not.toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  const after = screen.getByRole('textbox', { name: 'Your name on your server' });
  expect(after).toHaveProperty('value', 'Robin');
  expect(after.getAttribute('aria-invalid')).toBe('true');
  expect(descriptionOf(after)).toBe('Your name was not saved. Try again.');
});

it('marks the page being read and describes each row by its value', () => {
  function Rows() {
    const ref = useRef(null);
    return (
      <ul ref={ref}>
        <li>
          <LinkRow href="/settings/detection/" name="Detection" value="Standard, motion 80, sound 80" valueId="v-detection" current />
        </li>
        <li>
          <LinkRow href="/settings/sounds/" name="Alert sounds" value={null} valueId="v-sounds" />
        </li>
      </ul>
    );
  }
  const { container } = render(<Rows />);
  const detection = screen.getByRole('link', { name: 'Detection' });
  expect(detection.getAttribute('aria-current')).toBe('page');
  expect(descriptionOf(detection)).toBe('Standard, motion 80, sound 80');
  const sounds = screen.getByRole('link', { name: 'Alert sounds' });
  expect(sounds.getAttribute('aria-current')).toBeNull();
  // A value still being read is a loading bar, never a default.
  expect(descriptionOf(sounds)).toBe('');
  expect(container.querySelectorAll('.set-row__loading')).toHaveLength(1);
});

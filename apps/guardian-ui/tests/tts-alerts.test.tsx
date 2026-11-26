/** @jest-environment jsdom */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SoundsSettingsPage from '@/app/settings/sounds/page';
import { TTSManager, getTTSManager, resetTTSManager } from '@/lib/tts-alerts';
import { useSettingsStore } from '@/stores/settings-store';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@/lib/custom-sounds-db', () => ({
  ...jest.requireActual('@/lib/custom-sounds-db'),
  getAllCustomSounds: jest.fn().mockResolvedValue([]),
}));

const remote = { name: 'Google UK English Male', lang: 'en-GB', voiceURI: 'remote-en', localService: false, default: true };
const local = { name: 'Local English', lang: 'en-US', voiceURI: 'local-en', localService: true, default: false };
const french = { name: 'Local French', lang: 'fr-FR', voiceURI: 'local-fr', localService: true, default: false };

function speech(voices: SpeechSynthesisVoice[]) {
  const synth = Object.assign(new EventTarget(), {
    getVoices: () => voices,
    speak: jest.fn(),
    cancel: jest.fn(),
    onvoiceschanged: null,
  });
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: class { constructor(public text: string) {} },
  });
  return synth;
}

beforeEach(() => {
  document.documentElement.lang = 'en';
  localStorage.clear();
  useSettingsStore.getState().resetToDefaults();
});

afterEach(() => {
  resetTTSManager();
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
});

it('chooses a voice on the device over the browser’s preferred online voice', async () => {
  const synth = speech([remote, local]);
  const tts = new TTSManager();
  await tts.initialize();
  tts.speak('A cat is in view.');
  expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: local }));
  tts.dispose();
});

it('prefers a voice in the language of the page', async () => {
  document.documentElement.lang = 'fr';
  const synth = speech([local, french]);
  const tts = new TTSManager();
  await tts.initialize();
  tts.speak('Un chat est visible.');
  expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: french }));
  tts.dispose();
});

it('keeps spoken alerts silent with online voices alone and explains the choice in Settings', async () => {
  const synth = speech([remote]);
  const tts = getTTSManager();
  await tts.initialize();
  tts.speak('A cat is in view.');
  await act(async () => { render(<SoundsSettingsPage />); });

  expect(synth.speak).not.toHaveBeenCalled();
  expect(screen.getByText('This browser offers no voice that stays on this device. Spoken alerts stay quiet unless you choose an online voice.')).toBeTruthy();
  expect(screen.getByText('Some browsers’ voices send the alert’s words to the browser maker.')).toBeTruthy();
});

it('speaks through an online voice only after it is chosen in Settings', async () => {
  const synth = speech([remote]);
  await act(async () => { render(<SoundsSettingsPage />); });

  fireEvent.change(screen.getByLabelText('Spoken alert voice'), { target: { value: remote.voiceURI } });
  const tts = getTTSManager();
  await tts.initialize();
  tts.speak('A cat is in view.');

  expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: remote }));
});

it('speaks the first alert once the browser lists its voices', async () => {
  // A browser may list no voices until it has read them, then fire voiceschanged.
  let listed: SpeechSynthesisVoice[] = [];
  const synth = speech([]);
  synth.getVoices = () => listed;
  const tts = new TTSManager();
  await tts.initialize();
  tts.speak('A cat is in view.');

  listed = [remote, local];
  synth.dispatchEvent(new Event('voiceschanged'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(synth.speak).toHaveBeenCalledTimes(1);
  expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: local }));
  tts.dispose();
});

it('says spoken alerts stay quiet when the browser offers no voice at all', async () => {
  speech([]);
  await act(async () => { render(<SoundsSettingsPage />); });

  expect(screen.getByText('This browser offers no voice, so spoken alerts stay quiet.')).toBeTruthy();
  expect(screen.queryByText(/unless you choose an online voice/)).toBeNull();
});

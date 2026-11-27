/** @jest-environment jsdom */
/**
 * The sound check's pitch options say which pitches they read
 *
 * Each option under Audio Frequency Filtering, on Settings, Detection and in
 * the watch page's Audio Settings, only chooses the pitches the Audio level
 * is read from (pitchRangeOf in lib/audio-levels.ts): 300 to 600 Hz, the two
 * pitches set under Custom Range, or every pitch. Nothing listens for a cry,
 * a fall, a bark or a call for help, so no option's words say it does, and
 * each option's line names the pitches it reads.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import DetectionSettingsPage from '@/app/settings/detection/page';
import { pitchRangeOf } from '@/lib/audio-levels';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/settings/detection',
}));
jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ config: { wsUrl: '' }, isConnected: false }),
}));

afterEach(cleanup);

/** Words that say the option listens for something it does not. */
const LISTENS_FOR = /detect|recogni|identif|impact|calls? for help|distress|bark|whin|vocali[sz]/i;

/** The words an option's line must hold for the pitches pitchRangeOf reads under it. */
function pitchWords(value: string): string {
  if (value === 'custom') return 'the two pitches you set';
  const range = pitchRangeOf({ frequencyRange: value, customLowFreq: 100, customHighFreq: 200 });
  return range ? `${range.low} to ${range.high} Hz` : 'every pitch';
}

it('on Settings, Detection, names the pitches each option reads and claims to listen for nothing', () => {
  render(<DetectionSettingsPage />);
  const radios = screen.getAllByRole('radio').filter((radio) => radio.getAttribute('name') === 'frequencyRange') as HTMLInputElement[];
  expect(radios.map((radio) => radio.value)).toEqual(['all', 'baby_cry', 'pet_sounds', 'elderly_fall', 'custom']);
  for (const radio of radios) {
    const said = (radio.closest('label')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect([radio.value, said, LISTENS_FOR.test(said)]).toEqual([radio.value, said, false]);
    expect([radio.value, said.includes(pitchWords(radio.value))]).toEqual([radio.value, true]);
  }
});

it("in the watch page's Audio Settings, names the pitches each option reads and claims to listen for nothing", () => {
  const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'monitor', 'InlineSettingsPanel.tsx'), 'utf8');
  const options = Array.from(panel.matchAll(/\{ value: '(\w+)', label: '([^']*)', desc: '([^']*)' \}/g)).map((m) => ({
    value: m[1],
    said: `${m[2]} ${m[3]}`,
  }));
  expect(options.map((option) => option.value)).toEqual(['all', 'baby_cry', 'pet_sounds', 'elderly_fall', 'custom']);
  for (const { value, said } of options) {
    expect([value, said, LISTENS_FOR.test(said)]).toEqual([value, said, false]);
    expect([value, said.includes(pitchWords(value))]).toEqual([value, true]);
  }
  const summary = panel.slice(panel.indexOf("audioSettings.frequencyRange === 'all' ?"), panel.indexOf('</span>', panel.indexOf("audioSettings.frequencyRange === 'all' ?")));
  expect(summary).not.toMatch(LISTENS_FOR);
  expect(summary).not.toMatch(/Elderly Fall/);
});

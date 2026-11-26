/** @jest-environment jsdom */
/**
 * What leaves this device, and where the saved pictures are, on the privacy page
 *
 * The privacy page renders one table of the connections SafeOS makes or
 * leads to: the host's log, the detection model's download from Google's
 * storage after the person agrees, a spoken alert through one of the
 * browser's voices (some are an online service run by the browser's maker)
 * and a server the person connects. Each row says when, who sees what and
 * how to stop it. The table is its own component, so another page can render
 * it too.
 *
 * The page also names both of the browser's stores that keep the saved
 * pictures: Wildlife's sightings and their pictures are in localStorage,
 * People's frames and the pets in localStorage and IndexedDB.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import PrivacyPage from '@/app/privacy/page';

const words = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

function connections() {
  const table = screen.getByRole('table', { name: 'What leaves this device' });
  const rows = within(table).getAllByRole('row').slice(1);
  const row = (name: string) => {
    const found = rows.find((r) => words(within(r).getByRole('rowheader')) === name);
    expect([name, Boolean(found)]).toEqual([name, true]);
    return words(found);
  };
  return { table, rows, row };
}

it('lists each connection with when it happens, who sees what and how to stop it', () => {
  render(<PrivacyPage />);
  const { table, rows, row } = connections();
  expect(within(table).getAllByRole('columnheader').map(words)).toEqual(['Connection', 'When', 'Who sees what', 'How to stop it']);
  expect(rows.map((r) => words(within(r).getByRole('rowheader')))).toEqual([
    'The host’s log',
    'The detection model',
    'A spoken alert',
    'A server you connect',
  ]);
  for (const r of rows) expect(within(r).getAllByRole('cell')).toHaveLength(3);

  expect(row('The host’s log')).toContain('GitHub, which hosts safeos.sh, logs your IP address');
  expect(row('The detection model')).toContain('Only after you agree');
  expect(row('The detection model')).toContain('Google’s storage (storage.googleapis.com) sees your IP address');
  expect(row('A spoken alert')).toContain('People and Wildlife speak their alerts through one of the browser’s voices.');
  expect(row('A spoken alert')).toContain('Some voices are an online service run by the browser’s maker, which receives the words to speak.');
  expect(row('A spoken alert')).toContain('Voice Warnings');
  expect(row('A spoken alert')).toContain('Alert Mode');
  expect(row('A server you connect')).toContain('when Ollama is down or its analysis fails');
  expect(row('A server you connect')).toContain('Local instant');
});

it('says the spoken alerts can leave the device among what leaves it', () => {
  const { container } = render(<PrivacyPage />);
  expect(words(container)).toContain('A spoken alert can leave this device too:');
});

it('is one component another page can render', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DeviceConnections } = require('@/components/DeviceConnections') as { DeviceConnections: React.ComponentType };
  render(<DeviceConnections />);
  expect(screen.getByRole('table', { name: 'What leaves this device' })).toBeTruthy();
});

it('names both stores that keep the saved pictures', () => {
  const { container } = render(<PrivacyPage />);
  const page = words(container);
  for (const sentence of [
    'On this device, SafeOS keeps what it saves in this browser’s own storage: your settings, and Wildlife’s sightings with their pictures, in its localStorage; alerts, alert pictures and Lost & Found’s sightings in its IndexedDB; People’s saved frames and your pets’ photos in both.',
    'Wildlife keeps its sightings, with their pictures, in localStorage too.',
    'People keeps its saved frames in both localStorage and IndexedDB, and Lost & Found keeps your pets and their photos in both.',
  ]) {
    expect(page).toContain(sentence);
  }
});

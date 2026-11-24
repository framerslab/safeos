/** @jest-environment jsdom */
/**
 * The full-screen Lost and Found alert
 *
 * The alert names the pet's colours, as the alert list does, with no score,
 * no percentage and no claim that the pet was found.
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { LostFoundMediaOverlay } from '@/components/LostFoundMediaOverlay';

jest.mock('@/lib/custom-media-player', () => ({
  ...jest.requireActual('@/lib/custom-media-player'),
  resetMediaPlayer: () => {},
  getMediaPlayer: () => ({
    start() {}, stop() {}, pause() {}, resume() {},
    getState: () => null,
  }),
}));

afterEach(cleanup);

it("names the pet's colours, with no score and no match", () => {
  render(
    <LostFoundMediaOverlay isOpen onClose={() => {}} subjectName="Mittens" images={['data:image/png;base64,x']} />,
  );
  const dialog = screen.getByRole('alertdialog');
  expect(dialog.getAttribute('aria-label')).toBe('Could this be Mittens?');
  expect(screen.getByText('Colours and shape like Mittens’s photos.')).toBeTruthy();
  const words = `${dialog.getAttribute('aria-label')} ${dialog.textContent}`;
  expect(words).not.toMatch(/detect|match|confidence|%/i);
});

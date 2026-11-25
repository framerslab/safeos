/** @jest-environment jsdom */
/**
 * The full-screen Lost and Found alert
 *
 * The alert names the pet's colours, as the alert list does, with no score,
 * no percentage and no claim that the pet was found. It takes focus when it
 * opens, holds Tab, and gives focus back when it closes.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

it('takes focus from the watch, keeps Tab in, and gives focus back', () => {
  const watchKey = document.body.appendChild(document.createElement('button'));
  watchKey.focus();
  const { unmount } = render(
    <LostFoundMediaOverlay isOpen onClose={() => {}} subjectName="Mittens" images={['data:image/png;base64,x', 'data:image/png;base64,y']} />,
  );
  const dialog = screen.getByRole('alertdialog');
  expect(document.activeElement).toBe(dialog);

  const close = screen.getByRole('button', { name: 'Close alert' });
  const last = screen.getByRole('button', { name: 'Next image' });
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(last);

  // Focus that went to the watch comes back with the next Tab.
  watchKey.focus();
  fireEvent.keyDown(watchKey, { key: 'Tab' });
  expect(document.activeElement).toBe(close);

  unmount();
  expect(document.activeElement).toBe(watchKey);
  watchKey.remove();
});

it('leaves Space to the key that holds focus, and pauses with it everywhere else', () => {
  render(
    <LostFoundMediaOverlay isOpen onClose={() => {}} subjectName="Mittens" images={['data:image/png;base64,x']} />,
  );
  const mute = screen.getByRole('button', { name: 'Mute' });
  mute.focus();
  // A press the page does not cancel goes to the key.
  expect(fireEvent.keyDown(mute, { key: ' ' })).toBe(true);
  expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();

  const dialog = screen.getByRole('alertdialog');
  expect(fireEvent.keyDown(dialog, { key: ' ' })).toBe(false);
  expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
});

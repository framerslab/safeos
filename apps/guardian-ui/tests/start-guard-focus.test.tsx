/** @jest-environment jsdom */
/**
 * Focus after the question before a second watch
 *
 * Watch here closes the question. Focus goes back to the key that asked,
 * whether the watch then starts or fails, so a person using the keyboard
 * keeps their place.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useStartGuard } from '@/lib/start-guard';
import { askOtherTabs, takeOverWatch } from '@/lib/tab-channel';

jest.mock('@/lib/tab-channel', () => ({
  askOtherTabs: jest.fn(),
  takeOverWatch: jest.fn(),
  releaseStart: jest.fn(),
}));

function Page({ start }: { start: () => unknown }) {
  const { guard, dialog } = useStartGuard();
  return (
    <>
      <button type="button" onClick={(event) => void guard(start, event.currentTarget)}>Start</button>
      {dialog}
    </>
  );
}

afterEach(cleanup);

it('gives focus back to the start key when Watch here closes the question', async () => {
  jest.mocked(askOtherTabs).mockResolvedValue({ watching: true, way: 'monitor' });
  jest.mocked(takeOverWatch).mockResolvedValue(true);
  const start = jest.fn();
  render(<Page start={start} />);

  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await act(async () => {});
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Watch here' }));
  await act(async () => {});

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(start).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start' }));
});

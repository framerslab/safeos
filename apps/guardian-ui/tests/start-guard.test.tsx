/** @jest-environment jsdom */
/**
 * The question before a second watch
 *
 * One watch runs on a device at a time, across its tabs. A start key asks the
 * other tabs first; while one of them watches, the key asks the person before
 * anything starts, and starts only once the other tab has stopped.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { askOtherTabs, takeOverWatch } from '@/lib/tab-channel';
import { useStartGuard } from '@/lib/start-guard';

jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  askOtherTabs: jest.fn(),
  takeOverWatch: jest.fn(),
}));

const QUESTION = 'Watch here instead? The other tab stops.';
const asked = jest.mocked(askOtherTabs);
const takenOver = jest.mocked(takeOverWatch);
type Answer = Awaited<ReturnType<typeof askOtherTabs>>;

let start: jest.Mock;

// One start key, as a way's page has it, and the question it may show.
function StartKey() {
  const { guard, dialog } = useStartGuard();
  return (
    <>
      <button type="button" onClick={(event) => void guard(start, event.currentTarget)}>
        Start
      </button>
      {dialog}
    </>
  );
}

// An answer the case gives when it chooses.
function held<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

async function press(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
  await act(async () => {});
}

const question = () => screen.queryByRole('dialog', { name: QUESTION });
const key = (name: string) => within(screen.getByRole('dialog', { name: QUESTION })).getByRole('button', { name });

beforeEach(() => {
  start = jest.fn();
  asked.mockReset().mockResolvedValue({ watching: true, way: 'monitor' });
  takenOver.mockReset().mockResolvedValue(true);
});

afterEach(cleanup);

it('starts at once when no other tab watches', async () => {
  asked.mockResolvedValue({ watching: false });
  render(<StartKey />);
  await press('Start');
  expect(start).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('asks before a second watch, with focus on Cancel and nothing started', async () => {
  render(<StartKey />);
  await press('Start');
  const dialog = screen.getByRole('dialog', { name: QUESTION });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(['Watch here', 'Cancel']);
  expect(document.activeElement).toBe(key('Cancel'));
  expect(start).not.toHaveBeenCalled();
  expect(takenOver).not.toHaveBeenCalled();
});

it('Cancel starts nothing and returns focus to the key that opened the dialog', async () => {
  render(<StartKey />);
  await press('Start');
  await press('Cancel');
  expect(question()).toBeNull();
  expect(start).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start' }));
});

it('Escape does what Cancel does', async () => {
  render(<StartKey />);
  await press('Start');
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await act(async () => {});
  expect(question()).toBeNull();
  expect(start).not.toHaveBeenCalled();
  expect(takenOver).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start' }));
});

it('Watch here stops the other tab, then starts', async () => {
  render(<StartKey />);
  await press('Start');
  await press('Watch here');
  expect(question()).toBeNull();
  expect(takenOver).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(1);
  expect(takenOver.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0]);
});

it('keeps the question while the other tab does not stop', async () => {
  takenOver.mockResolvedValue(false);
  render(<StartKey />);
  await press('Start');
  await press('Watch here');
  expect(question()).not.toBeNull();
  expect(document.activeElement).toBe(key('Cancel'));
  expect(start).not.toHaveBeenCalled();
});

it('a start asked for on a page that was left does not run', async () => {
  const answer = held<Answer>();
  asked.mockReturnValueOnce(answer.promise);
  const first = render(<StartKey />);
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  first.unmount();
  await act(async () => {
    answer.answer({ watching: false });
  });
  expect(start).not.toHaveBeenCalled();

  const taken = held<boolean>();
  takenOver.mockReturnValueOnce(taken.promise);
  const second = render(<StartKey />);
  await press('Start');
  await press('Watch here');
  second.unmount();
  await act(async () => {
    taken.answer(true);
  });
  expect(takenOver).toHaveBeenCalledTimes(1);
  expect(start).not.toHaveBeenCalled();
});

it('holds focus inside the dialog', async () => {
  render(<StartKey />);
  await press('Start');
  expect(document.activeElement).toBe(key('Cancel'));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  expect(document.activeElement).toBe(key('Watch here'));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  expect(document.activeElement).toBe(key('Cancel'));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(key('Watch here'));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(key('Cancel'));
});

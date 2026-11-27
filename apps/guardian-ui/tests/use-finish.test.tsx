/** @jest-environment jsdom */
/**
 * The last key's press
 *
 * A press with no use names what is missing; a press with a use marks setup
 * finished, writes the record once, ends the camera and opens the dashboard or
 * the way named in place of setup in the browser's history. A refused write
 * is said on the first press and the second opens the page for this visit.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { finishHref, finishWay, useFinish, type FinishOptions } from '@/lib/use-finish';
import { finishSetup, NO_ANSWERS } from '@/lib/setup-answers';
import { WAYS, wayFromParam } from '@/lib/app-routes';
import { lastKeyWords } from '@/components/setup/LastKey';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/setup-answers', () => ({
  ...jest.requireActual('@/lib/setup-answers'),
  finishSetup: jest.fn(() => true),
}));

const finish = finishSetup as jest.Mock;
const lostFound = WAYS.find((way) => way.id === 'lost-found') ?? null;

let closeCamera: jest.Mock;
let onMissingUse: jest.Mock;
let onFinished: jest.Mock;

function Finish(props: Partial<FinishOptions>) {
  const { state, press } = useFinish({
    answers: { ...NO_ANSWERS, use: 'pet' },
    run: 'first',
    usedBefore: null,
    way: null,
    closeCamera,
    onMissingUse,
    onFinished,
    ...props,
  });
  return (
    <>
      <p data-testid="state">{state}</p>
      <button type="button" onClick={press}>
        Finish
      </button>
    </>
  );
}

const state = () => screen.getByTestId('state').textContent;
const press = () => fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

beforeEach(() => {
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  finish.mockReset();
  finish.mockReturnValue(true);
  closeCamera = jest.fn();
  onMissingUse = jest.fn();
  onFinished = jest.fn();
});
afterEach(() => {
  cleanup();
});

describe("the last key's press", () => {
  it('opens the dashboard once, after ending the camera', () => {
    render(<Finish />);
    press();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith({ ...NO_ANSWERS, use: 'pet' }, 'first', null);
    expect(closeCamera).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
    expect(mockRouter.replace.mock.invocationCallOrder[0]).toBeGreaterThan(closeCamera.mock.invocationCallOrder[0]);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(state()).toBe('opening');
  });

  it('opens the page of the way whose row opened setup', () => {
    render(<Finish way={lostFound} />);
    press();
    expect(mockRouter.replace).toHaveBeenCalledWith('/lost-found/');
  });

  it.each([
    [true, null, '/lost-found/'],
    [true, 'wildlife', '/lost-found/'],
    [true, 'lost-found', '/lost-found/'],
    [false, 'wildlife', '/wildlife/'],
    [false, 'lost-found', '/lost-found/'],
    [false, null, '/dashboard'],
  ] as const)('with A lost pet chosen %s, opened from the row %s, the last key opens %s', (chosen, next, href) => {
    expect(finishHref(finishWay(chosen, wayFromParam(next)))).toBe(href);
    expect(lastKeyWords(finishWay(true, wayFromParam('wildlife')), false)).toBe('Open Lost and Found');
  });

  it('marks setup finished before anything is written', () => {
    render(<Finish />);
    press();
    expect(onFinished.mock.invocationCallOrder[0]).toBeLessThan(finish.mock.invocationCallOrder[0]);
  });

  it('names what is missing and opens nothing when no use is chosen', () => {
    render(<Finish answers={NO_ANSWERS} />);
    press();
    expect(onMissingUse).toHaveBeenCalledTimes(1);
    expect(finish).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
    expect(closeCamera).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(state()).toBe('rest');
  });

  it('a second press while the destination opens does nothing', () => {
    render(<Finish />);
    act(() => {
      press();
      press();
    });
    expect(finish).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it('names what was not saved, then opens the destination on a second press', () => {
    finish.mockReturnValue(false);
    render(<Finish />);
    press();
    expect(state()).toBe('unsaved');
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(closeCamera).not.toHaveBeenCalled();
    press();
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(closeCamera).toHaveBeenCalledTimes(1);
    expect(state()).toBe('opening');
  });
});

/** @jest-environment jsdom */
/**
 * Setup's step in the browser's history
 *
 * Each step is its own entry on the same address: going on pushes an entry
 * for step 2, the browser's back and forward buttons move between the two, a
 * reload of step 2's entry opens step 1, and Back on step 2 goes back one
 * entry.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSetupStep } from '@/lib/setup-history';

function Steps() {
  const { step, entered, toStep2, backToStep1 } = useSetupStep();
  return (
    <div>
      <p data-testid="step">{step}</p>
      <p data-testid="entered">{entered}</p>
      <button type="button" onClick={toStep2}>
        Go on
      </button>
      <button type="button" onClick={backToStep1}>
        Go back
      </button>
    </div>
  );
}

const shown = () => [screen.getByTestId('step').textContent, screen.getByTestId('entered').textContent];

beforeEach(() => {
  window.history.replaceState(null, '', '/setup/?next=monitor');
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe("setup's step in the browser's history", () => {
  it('opens on step 1 and gives step 2 its own entry on the same address', () => {
    render(<Steps />);
    expect(shown()).toEqual(['1', 'first']);
    const entries = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'Go on' }));
    expect(shown()).toEqual(['2', 'change']);
    expect(window.history.length).toBe(entries + 1);
    expect(window.history.state.setupStep).toBe(2);
    expect(window.location.pathname + window.location.search).toBe('/setup/?next=monitor');
  });

  it("follows the browser's back and forward buttons", () => {
    render(<Steps />);
    fireEvent.click(screen.getByRole('button', { name: 'Go on' }));
    expect(shown()).toEqual(['2', 'change']);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    expect(shown()).toEqual(['1', 'change']);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { setupStep: 2 } }));
    });
    expect(shown()).toEqual(['2', 'change']);
  });

  it('opens a reloaded step 2 on step 1, and marks its entry as step 1', () => {
    window.history.replaceState({ setupStep: 2, kept: 'yes' }, '');
    render(<Steps />);
    expect(shown()[0]).toBe('1');
    expect(window.history.state).toEqual({ setupStep: 1, kept: 'yes' });
  });

  it('goes back one entry for step 1', () => {
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => undefined);
    render(<Steps />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});

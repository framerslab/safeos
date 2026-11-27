/** @jest-environment jsdom */
/**
 * The use and the Lost and Found choice this device holds
 *
 * Setup's answers show none chosen until script has read the device's
 * record; then the use it holds, and whether Lost and Found is its saved
 * choice, each read once.
 */

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { useSavedLostFound, useSavedUse } from '@/lib/use-setup-done';
import { useOnboardingStore } from '@/stores/onboarding-store';

let usesSeen: unknown[];
let lostFoundSeen: unknown[];

function Reader() {
  usesSeen.push(useSavedUse());
  lostFoundSeen.push(useSavedLostFound());
  return null;
}

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
  usesSeen = [];
  lostFoundSeen = [];
});
afterEach(() => {
  cleanup();
});

describe('the use and the Lost and Found choice this device holds', () => {
  it('answers undefined until the record is read, then the use it holds', () => {
    useOnboardingStore.setState({ selectedScenario: 'elderly' });
    render(<Reader />);
    expect(usesSeen[0]).toBeUndefined();
    expect(usesSeen[usesSeen.length - 1]).toBe('elderly');
  });

  it('answers null on a device that holds no use', () => {
    render(<Reader />);
    expect(usesSeen[usesSeen.length - 1]).toBeNull();
  });

  it('answers undefined until the record is read, then whether Lost and Found is the saved choice', () => {
    useOnboardingStore.setState({ lostFoundChosen: true });
    render(<Reader />);
    expect(lostFoundSeen[0]).toBeUndefined();
    expect(lostFoundSeen[lostFoundSeen.length - 1]).toBe(true);
    const first = usesSeen.findIndex((value) => value !== undefined);
    expect(lostFoundSeen.findIndex((value) => value !== undefined)).toBe(first);
    cleanup();

    useOnboardingStore.getState().reset();
    lostFoundSeen = [];
    usesSeen = [];
    render(<Reader />);
    expect(lostFoundSeen[lostFoundSeen.length - 1]).toBe(false);
  });
});

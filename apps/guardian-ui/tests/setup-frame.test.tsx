/** @jest-environment jsdom */
/**
 * The frame both setup steps share
 *
 * Back and the step's progress glyph stand in one row before the step's one
 * heading; the glyph has a copy under the heading for a row too narrow to hold
 * it; the heading takes focus only when the step was entered by a change, and
 * only such a step fades in; the look row closes the column, named for what a
 * press does, and says nothing else.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StepFrame, StepHeading } from '@/components/setup/StepFrame';
import { useThemeStore } from '@/lib/theme-manager';
import { bare, words } from './helpers/served-html';

const HEADING = 'Use this device to watch a place';

let onBack: jest.Mock;

function framed(props: { step?: 1 | 2; entered?: 'first' | 'change'; focus?: boolean } = {}) {
  const { focus, ...frame } = props;
  return render(
    <StepFrame step={1} entered="first" backHref="/" onBack={onBack} {...frame}>
      <StepHeading step={props.step ?? 1} id="h" focus={focus ?? false}>
        {HEADING}
      </StepHeading>
    </StepFrame>
  );
}

const follows = (first: Node, second: Node) => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState({ themeMode: 'light', resolvedTheme: 'light' });
  document.documentElement.className = '';
  // A press on Back is the flow's to handle; the address stays.
  onBack = jest.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('the frame both setup steps share', () => {
  it('puts Back and the glyph in one row before the heading', () => {
    const { container } = framed();
    const row = container.querySelector('.setup-back-row') as HTMLElement;
    expect(row).not.toBeNull();
    const back = within(row).getByRole('link', { name: 'Back' });
    expect(bare(back.getAttribute('href'))).toBe('/');
    const glyph = within(row).getByRole('img', { name: 'Step 1 of 2' });
    expect(follows(back, glyph)).toBe(true);
    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(follows(row, headings[0])).toBe(true);
    expect(words(headings[0])).toBe(HEADING);
  });

  it("fills the glyph's segments by its step", () => {
    const first = framed();
    const rowGlyph = (container: HTMLElement) => container.querySelector('.setup-back-row svg') as SVGElement;
    expect(rowGlyph(first.container).querySelectorAll('rect.setup-progress__on')).toHaveLength(1);
    expect(rowGlyph(first.container).querySelectorAll('rect.setup-progress__off')).toHaveLength(1);
    cleanup();

    const second = framed({ step: 2 });
    expect(rowGlyph(second.container).querySelectorAll('rect.setup-progress__on')).toHaveLength(2);
    expect(rowGlyph(second.container).querySelectorAll('rect.setup-progress__off')).toHaveLength(0);
    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThan(0);
    expect(images.map((image) => image.getAttribute('aria-label'))).toEqual(images.map(() => 'Step 2 of 2'));
  });

  it("draws the glyph's copy under the heading, named the same", () => {
    const { container } = framed();
    const heading = container.querySelector('h1') as HTMLElement;
    const under = container.querySelector('svg.setup-progress--under') as SVGElement;
    expect(under).not.toBeNull();
    expect(follows(heading, under)).toBe(true);
    expect(under.getAttribute('role')).toBe('img');
    expect(under.getAttribute('aria-label')).toBe('Step 1 of 2');
  });

  it('calls onBack on a press of Back', () => {
    framed();
    fireEvent.click(screen.getByRole('link', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onBack.mock.calls[0][0]).toHaveProperty('type', 'click');
  });

  it('focuses the heading of a step entered by a change, and not on the first load', () => {
    framed({ focus: true, entered: 'change' });
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: HEADING }));
    cleanup();
    framed({ focus: false });
    expect(document.activeElement).toBe(document.body);
  });

  it('fades only a step entered by a change', () => {
    const first = framed({ entered: 'first' });
    expect(first.container.querySelector('.setup-step[data-entered="first"]')).not.toBeNull();
    expect(first.container.querySelector('.setup-step[data-entered="change"]')).toBeNull();
    cleanup();
    const change = framed({ entered: 'change' });
    expect(change.container.querySelector('.setup-step[data-entered="change"]')).not.toBeNull();
  });

  it('ends with the look row, named for what a press does', () => {
    const { container } = framed();
    const look = container.querySelector('.setup-look') as HTMLElement;
    const status = look.querySelector('[role="status"]') as HTMLElement;
    expect(within(look).getByRole('button', { name: 'Switch to the dark look' })).toBeTruthy();
    expect(status.textContent).toBe('');

    // The column says the frame's words and the row's, and nothing else.
    const cut = [
      'Back',
      'Step 1 of 2',
      HEADING,
      'Switch to the dark look',
      'Switch to the light look',
      'Dark look on',
      'Light look on',
    ].sort((a, b) => b.length - a.length);
    const rest = () => cut.reduce((text, said) => text.split(said).join(' '), words(container.querySelector('main.setup')));

    fireEvent.click(within(look).getByRole('button', { name: 'Switch to the dark look' }));
    expect(within(look).getByRole('button', { name: 'Switch to the light look' })).toBeTruthy();
    expect(status.textContent).toBe('Dark look on');
    expect(rest().trim()).toBe('');

    fireEvent.click(within(look).getByRole('button', { name: 'Switch to the light look' }));
    expect(within(look).getByRole('button', { name: 'Switch to the dark look' })).toBeTruthy();
    expect(status.textContent).toBe('Light look on');
    expect(rest().trim()).toBe('');
  });
});

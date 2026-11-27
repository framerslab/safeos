/** @jest-environment jsdom */
/**
 * Setup's question: what is it watching?
 *
 * Five answers in one group named by the step's heading, none chosen until a
 * press or the device's own record; the chosen answer's words under the
 * group; the baby's statement with its two links; a lost pet drawn with the
 * dashboard's own paw; the missing use named above the group.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BABY_STATEMENT, LOST_PET_WORDS, UseChoice, type UseChoiceProps } from '@/components/setup/UseChoice';
import { IconPaw } from '@/components/icons';

const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const plain = (text: string) => text.replace(/’/g, "'");

const LOST_PET =
  'SafeOS watches for your pet’s colours near home and keeps a picture of each possible sighting. Add your pet’s photos on the Lost and Found page, then press Start watching there.';
const BABY =
  'SafeOS is not a medical device. It does not watch breathing or any vital sign and cannot detect or prevent SIDS. Follow safe-sleep guidance.';
const NAMES = ['A pet', 'A baby', 'An elderly relative', 'An empty place', 'A lost pet'];

let onChoose: jest.Mock;

function element(props: Partial<UseChoiceProps> = {}) {
  return (
    <>
      <h1 id="setup-step2-heading">What is it watching?</h1>
      <UseChoice chosen={null} missing={false} focusFirst={0} onChoose={onChoose} {...props} />
    </>
  );
}
const uses = (props: Partial<UseChoiceProps> = {}) => render(element(props));
const said = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('#setup-use-words p')).map((p) => words(p));

beforeEach(() => {
  onChoose = jest.fn();
});
afterEach(() => {
  cleanup();
});

describe('what is it watching?', () => {
  it("offers five answers in one group named by the step's heading, none chosen", () => {
    const { container } = uses();
    const group = screen.getByRole('radiogroup', { name: 'What is it watching?' });
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((radio) => words(radio.closest('label')))).toEqual(NAMES);
    radios.forEach((radio, index) => expect(within(group).getByRole('radio', { name: NAMES[index] })).toBe(radio));
    expect(radios.some((radio) => radio.checked)).toBe(false);
    expect(words(container.querySelector('#setup-use-words'))).toBe('');
  });

  it.each([
    ['pet', ['SafeOS sounds an alert here when your pet moves. History lists each alert with its time, for when you get back.']],
    [
      'elderly',
      [
        'SafeOS sounds an alert here when they move or make a sound, and, if you set a time in Settings, when nothing moves for that long.',
        'Ask before you watch or listen to another adult. Laws on recording sound differ by place.',
      ],
    ],
    ['security', ['SafeOS sounds an alert here when anything moves in the picture or this device hears a sound. Point it at a room, a doorway or a yard.']],
    ['lost_found', [LOST_PET]],
  ] as const)('shows the words of %s once chosen', (choice, lines) => {
    const { container } = uses({ chosen: choice });
    const at = ['pet', 'baby', 'elderly', 'security', 'lost_found'].indexOf(choice);
    expect((screen.getByRole('radio', { name: NAMES[at] }) as HTMLInputElement).checked).toBe(true);
    expect(said(container)).toEqual(lines.map(plain));
    expect(LOST_PET_WORDS).toBe(LOST_PET);
  });

  it("shows the baby's statement with its two links", () => {
    const { container } = uses({ chosen: 'baby' });
    const parts = Array.from((container.querySelector('#setup-use-words > div') as HTMLElement).children);
    expect(words(parts[0])).toBe('For a nap while you stay close enough to hear this device.');
    expect(words(parts[1])).toBe(BABY);
    const nih = screen.getByRole('link', { name: 'Safe-sleep guidance from the NIH, opens in a new tab' });
    expect(parts[2]).toBe(nih);
    expect(nih.getAttribute('href')).toBe('https://safetosleep.nichd.nih.gov/reduce-risk/reduce');
    expect(nih.getAttribute('target')).toBe('_blank');
    expect(nih.getAttribute('rel')).toContain('noopener');
    expect(words(parts[3])).toBe('Keep this device and its cord at least 3 feet (1 metre) from the crib.');
    const cpsc = screen.getByRole('link', { name: 'Cord safety from the CPSC, opens in a new tab' });
    expect(parts[4]).toBe(cpsc);
    expect(cpsc.getAttribute('href')).toBe('https://www.cpsc.gov/content/baby-monitor-cords-have-strangled-children');
    expect(BABY_STATEMENT).toBe(BABY);
  });

  it('chooses with a press and stays on the step', () => {
    uses();
    fireEvent.click(screen.getByRole('radio', { name: 'A baby' }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('baby');
    fireEvent.click(screen.getByRole('radio', { name: 'A lost pet' }));
    expect(onChoose).toHaveBeenLastCalledWith('lost_found');
  });

  it('draws the chosen option with its square in the slot every option keeps', () => {
    const { container, rerender } = uses({ chosen: 'pet' });
    const boxes = () => Array.from(container.querySelectorAll('span.setup-use__box')) as HTMLElement[];
    expect(boxes()).toHaveLength(5);
    boxes().forEach((box, index) => {
      const slot = box.querySelectorAll('span.setup-use__slot');
      expect(slot).toHaveLength(1);
      const glyph = box.querySelector('svg.setup-use__glyph') as SVGElement;
      expect(slot[0].compareDocumentPosition(glyph) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(box.getAttribute('data-chosen')).toBe(index === 0 ? 'true' : 'false');
      expect(box.querySelectorAll('span.setup-use__square')).toHaveLength(index === 0 ? 1 : 0);
    });
    rerender(element({ chosen: 'lost_found' }));
    boxes().forEach((box, index) => expect(box.getAttribute('data-chosen')).toBe(index === 4 ? 'true' : 'false'));
  });

  it("draws A lost pet with the paw the dashboard's Lost and Found row draws", () => {
    const { container } = uses();
    const fifth = container.querySelectorAll('span.setup-use__box')[4] as HTMLElement;
    const glyph = fifth.querySelector('svg.setup-use__glyph') as SVGElement;
    const paw = render(<IconPaw />).container.querySelector('svg') as SVGElement;
    expect(glyph.innerHTML).toBe(paw.innerHTML);
    expect(glyph.getAttribute('width')).toBe('24');
    expect(glyph.getAttribute('height')).toBe('24');
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(glyph.getAttribute('focusable')).toBe('false');
  });

  it('names the missing use above the options and moves focus to the first', () => {
    const { container, rerender } = uses({ focusFirst: 0 });
    rerender(element({ missing: true, focusFirst: 1 }));
    const says = container.querySelector('.setup-use-says[role="status"]') as HTMLElement;
    expect(says.querySelector('svg.problem-mark')).not.toBeNull();
    expect(words(says)).toBe('Choose what this device is watching.');
    const group = screen.getByRole('radiogroup');
    expect(says.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'A pet' }));
  });

  it("ties the chosen use's words to the group, read when they change", () => {
    const { container } = uses();
    expect(screen.getByRole('radiogroup').getAttribute('aria-describedby')).toBe('setup-use-words');
    expect(container.querySelector('#setup-use-words')?.getAttribute('aria-live')).toBe('polite');
  });

  it('shows none chosen until the device is read, then the saved use, with nothing made again', () => {
    const { container, rerender } = uses({ chosen: null });
    const labels = Array.from(container.querySelectorAll('label'));
    rerender(element({ chosen: 'elderly' }));
    Array.from(container.querySelectorAll('label')).forEach((label, index) => expect(label).toBe(labels[index]));
    expect((screen.getByRole('radio', { name: 'An elderly relative' }) as HTMLInputElement).checked).toBe(true);
    const group = screen.getByRole('radiogroup');
    const after = container.querySelector('#setup-use-words') as HTMLElement;
    expect(group.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(words(after)).toContain('SafeOS sounds an alert here when they move or make a sound');
  });

  it('holds no score word beside A lost pet', () => {
    const { container } = uses({ chosen: 'lost_found' });
    const score = /\bmatch(es|ed|ing)?\b|detected|identif|recogni[sz]|confidence|%|intruder|threat/i;
    expect(words(screen.getByRole('radiogroup'))).not.toMatch(score);
    expect(words(container.querySelector('#setup-use-words'))).not.toMatch(score);
  });
});

/** @jest-environment node */
/**
 * Setup's frame as it is served
 *
 * Before the page's script runs, Back is a working link to the home page,
 * the step's glyph and heading stand, and the look row's place is held empty
 * after the first screen, so nothing moves when the row appears.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepFrame, StepHeading } from '@/components/setup/StepFrame';
import { bare, served, words } from './helpers/served-html';

const HEADING = 'Use this device to watch a place';

function framed() {
  return (
    <StepFrame step={1} entered="first" backHref="/" onBack={() => undefined}>
      <StepHeading step={1} id="h" focus={false}>
        {HEADING}
      </StepHeading>
    </StepFrame>
  );
}

describe("setup's frame as served", () => {
  it("serves Back, the glyph and the heading before script, and holds the look row's place", () => {
    const html = renderToStaticMarkup(framed());
    const doc = served(html);
    const back = doc.querySelector('.setup-back-row a');
    expect(words(back)).toBe('Back');
    expect(bare(back?.getAttribute('href'))).toBe('/');
    const glyph = doc.querySelector('.setup-back-row svg[role="img"]');
    expect(glyph?.getAttribute('aria-label')).toBe('Step 1 of 2');
    const headings = doc.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(words(headings[0])).toBe(HEADING);
    const place = doc.querySelector('.setup-look .setup-look-row--place');
    expect(place?.getAttribute('aria-hidden')).toBe('true');
    expect(words(place)).toBe('');
    expect(doc.querySelector('button')).toBeNull();
    expect(html).not.toContain('opacity-0');
  });

  it('keeps the look row out of the first screen', () => {
    const doc = served(renderToStaticMarkup(framed()));
    const main = doc.querySelector('main.setup') as Element;
    expect(main).not.toBeNull();
    const screen = main.firstElementChild as Element;
    expect(screen.tagName.toLowerCase()).toBe('div');
    expect(screen.classList.contains('setup-screen')).toBe(true);
    expect(Array.from(screen.children).map((child) => child.className)).toEqual(['setup-back-row', 'setup-step']);
    expect(screen.querySelector('.setup-look')).toBeNull();
    const next = screen.nextElementSibling as Element;
    expect(next?.classList.contains('setup-look')).toBe(true);
  });
});

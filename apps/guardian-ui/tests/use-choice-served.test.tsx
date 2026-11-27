/** @jest-environment node */
/**
 * Setup's question as it is served
 *
 * Before the page's script runs, the five answers stand as native radios,
 * A lost pet the last, and none of the old setup's names is left.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UseChoice } from '@/components/setup/UseChoice';
import { served, words } from './helpers/served-html';

describe("setup's question as served", () => {
  it('serves the five answers before script, with none of the old names', () => {
    const html = renderToStaticMarkup(
      <>
        <h1 id="setup-step2-heading">What is it watching?</h1>
        <UseChoice chosen={null} missing={false} focusFirst={0} onChoose={() => {}} />
      </>
    );
    const page = served(html);
    const radios = Array.from(page.querySelectorAll('input[type="radio"][name="setup-use"]'));
    expect(radios).toHaveLength(5);
    const names = Array.from(page.querySelectorAll('label.setup-use')).map((label) => words(label));
    expect(names).toEqual(['A pet', 'A baby', 'An elderly relative', 'An empty place', 'A lost pet']);
    expect(html).not.toContain('opacity-0');
    const said = words(page.body);
    for (const old of [
      'Pet Monitoring',
      'Baby Monitoring',
      'Elderly Care',
      'Security Mode',
      'Lost & Found',
      'Select Monitoring Scenario',
      'You can change this later in settings.',
    ]) {
      expect(said.split(old).length - 1).toBe(0);
    }
  });
});

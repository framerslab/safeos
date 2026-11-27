/** @jest-environment node */
/**
 * Setup's step 1 as it is served
 *
 * Before the page's script runs, the step's words and both keys stand, the
 * line for a browser without script is in the page, and none of the old
 * setup's words is left.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CameraStep } from '@/components/setup/CameraStep';
import { NEEDS_SCRIPT } from '@/lib/needs-script';
import { served, words } from './helpers/served-html';

const noop = () => undefined;

function step() {
  return (
    <CameraStep
      ask="not-asked"
      asking={null}
      failure={null}
      savedCamera={false}
      serverSaved={false}
      storageEnds={false}
      focus={false}
      onTurnOn={noop}
      onDefaultCamera={noop}
      onContinue={noop}
    />
  );
}

describe("setup's step 1 as served", () => {
  it("serves the step's words and both keys before script", () => {
    const html = renderToStaticMarkup(step());
    const page = served(html);
    const body = page.body;
    const said = words(body);
    expect(words(page.querySelector('h1'))).toBe('Use this device to watch a place');
    expect(said).toContain(
      "SafeOS watches with the camera and microphone and sounds an alert here when something moves, makes a sound or, for a lost pet, when its colours come into view."
    );
    const buttons = Array.from(page.querySelectorAll('button')).map((button) => words(button));
    expect(buttons).toEqual(expect.arrayContaining(['Turn on the camera', 'Continue without the camera']));
    expect(said).toContain('Your browser will ask you to allow the camera and microphone.');
    expect(said).toContain(
      'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.'
    );
    expect(said).toContain('The picture stays on this device.');
    expect(words(page.querySelector('#setup-needs-script'))).toBe(words(served(`<p>${NEEDS_SCRIPT}</p>`).querySelector('p')));
    expect(html).not.toContain('opacity-0');
    for (const old of [
      'Begin Setup',
      'Important Disclaimers',
      'Accept & Continue',
      'I understand these limitations',
      'System Setup',
      'Device Access',
      'Grant Permissions',
      'AI',
      'monitor',
    ]) {
      expect(said.split(old).length - 1).toBe(0);
    }
  });
});

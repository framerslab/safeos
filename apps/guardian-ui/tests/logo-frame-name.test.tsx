/**
 * The Frame mark beside the logo's wordmark
 *
 * Each maker's mark image has an empty text equivalent, because its name
 * stands beside it in text. Beside the logo no name stands, so the mark's
 * box is one image named "Frame".
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Logo } from '@/components/Logo';

describe('the logo with the Frame mark', () => {
  it('names the Frame mark "Frame" for a screen reader', () => {
    expect(renderToStaticMarkup(<Logo />)).toMatch(/<div[^>]*role="img"[^>]*aria-label="Frame"/);
  });

  it('holds no such name when the Frame mark is not shown', () => {
    expect(renderToStaticMarkup(<Logo showFrame={false} />)).not.toContain('aria-label="Frame"');
  });
});

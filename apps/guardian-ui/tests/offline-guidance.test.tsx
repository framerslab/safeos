import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '@/app/page';
import FAQPage from '@/app/faq/page';

beforeAll(() => {
  Object.defineProperty(window, 'location', { value: new URL('http://localhost/'), configurable: true });
});

function text(Page: React.ComponentType) {
  return renderToStaticMarkup(<Page />).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

it('the FAQ distinguishes initial preparation from later offline detection', () => {
  const content = text(FAQPage);
  expect(content).not.toContain('need a connection to load it');
  expect(content).not.toContain('keeps a copy of the pages you have opened');
  expect(content).not.toContain('clear when you reload');
});

it('home offers only the detection model that settings can download', () => {
  const content = text(HomePage);
  expect(content).not.toMatch(/Scene classifier download|Vision Transformer|cross-checks ambiguous scenes/);
});

it('the home offline card describes installed pages, saved models and retained alerts', () => {
  const content = text(HomePage);
  expect(content).not.toContain('Pages you have opened');
  expect(content).not.toContain('need a connection to load it');
  expect(content).not.toContain('monitor alerts clear on reload');
});

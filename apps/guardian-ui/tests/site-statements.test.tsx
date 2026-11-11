/**
 * Site statements match the code
 *
 * The privacy page says the app runs no tracking, and the pledge and
 * sponsorship pages say what a sponsorship pays for. These tests hold those
 * statements to the shipped code: no tracking loader in the app, the donate
 * page rendered as a visitor sees it, and the pledge worded one way on every
 * page and in the README.
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DonatePage, { metadata as donateMetadata } from '@/app/donate/page';

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');

function listFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const SOURCE_FILES = listFiles(path.join(APP_ROOT, 'src'), ['.ts', '.tsx', '.js']).concat(
  listFiles(path.join(APP_ROOT, 'public'), ['.js', '.html'])
);

// Pages a visitor can open, the shared layout pieces, and the docs people read.
const VISITOR_TEXT_FILES = listFiles(path.join(APP_ROOT, 'src', 'app'), ['.tsx', '.ts'])
  .concat(listFiles(path.join(APP_ROOT, 'src', 'components', 'layout'), ['.tsx']))
  .concat([
    path.join(APP_ROOT, 'src', 'lib', 'disclaimers.ts'),
    path.join(REPO_ROOT, 'README.md'),
    path.join(REPO_ROOT, '.github', 'FUNDING.yml'),
  ])
  .concat(listFiles(path.join(REPO_ROOT, 'docs'), ['.md']));

function rel(file: string): string {
  return path.relative(REPO_ROOT, file);
}

function filesMatching(files: string[], pattern: RegExp): string[] {
  return files.filter((f) => pattern.test(fs.readFileSync(f, 'utf8'))).map(rel);
}

describe('no tracking loader in the app', () => {
  it.each([
    ['Google tag manager host', /googletagmanager\.com/],
    ['gtag call', /\bgtag\s*\(/],
    ['Microsoft Clarity host', /clarity\.ms/],
    ['Google Analytics build id', /NEXT_PUBLIC_GA_ID/],
    ['Clarity build id', /NEXT_PUBLIC_CLARITY_ID/],
  ])('no source file carries a %s', (_name, pattern) => {
    expect(filesMatching(SOURCE_FILES, pattern)).toEqual([]);
  });
});

describe('donate page', () => {
  const html = renderToStaticMarkup(React.createElement(DonatePage));
  const description = String(donateMetadata.description ?? '');

  it('links the Sponsor button to the framerslab sponsors page', () => {
    expect(html).toContain('href="https://github.com/sponsors/framerslab"');
  });

  it('carries no link to the old sponsor addresses', () => {
    expect(html).not.toMatch(/sponsors\/framersai/);
    expect(html).not.toMatch(/sponsors\/manicinc/);
    expect(html).not.toMatch(/parent agency/i);
  });

  it('says a sponsorship supports development by Frame and is not a tax-deductible donation', () => {
    expect(html).toMatch(/Framers Lab, Inc\./);
    expect(html).toMatch(/not a tax-deductible donation/i);
  });

  it('makes no percentage pledge and never says nonprofit or charity', () => {
    for (const text of [html, description]) {
      expect(text).not.toMatch(/\d+\s*%/);
      expect(text).not.toMatch(/\bten percent\b/i);
      expect(text).not.toMatch(/non-?profit/i);
      expect(text).not.toMatch(/\bcharit/i);
    }
  });
});

describe('the humanitarian pledge reads one way everywhere', () => {
  it('no page or doc gives the pledge as a percentage', () => {
    expect(
      filesMatching(VISITOR_TEXT_FILES, /10%\s*for\s*Humanity|\bten percent\b|10% of (all|every|our)|donate 10%/i)
    ).toEqual([]);
  });

  it('no page or doc calls SafeOS or its maker a nonprofit or a charity', () => {
    expect(filesMatching(VISITOR_TEXT_FILES, /non-?profit|\bcharit(y|ies|able)\b/i)).toEqual([]);
  });

  it('no FUNDING entry points at an account that is not framerslab', () => {
    const funding = fs.readFileSync(path.join(REPO_ROOT, '.github', 'FUNDING.yml'), 'utf8');
    expect(funding).not.toMatch(/framersai|manicinc/);
    expect(funding).toMatch(/framerslab/);
  });
});

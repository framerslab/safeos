/**
 * Site statements match the code
 *
 * The privacy page says the app runs no tracking, and safeos.sh asks for no
 * money. These tests hold those statements to the shipped code: no tracking
 * loader in the app, the old support address rendered as a visitor sees it,
 * and no page or doc making a pledge or calling SafeOS a charity.
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DonatePage, { metadata as donateMetadata } from '@/app/donate/page';

// The old support address forwards to About with the app router.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

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
  .concat(listFiles(path.join(REPO_ROOT, 'docs'), ['.md']))
  .concat(listFiles(path.join(APP_ROOT, 'src', 'lib', 'i18n'), ['.ts']))
  .concat(listFiles(path.join(APP_ROOT, 'src', 'i18n'), ['.json']));

// The translated strings, every language.
const TRANSLATION_FILES = listFiles(path.join(APP_ROOT, 'src', 'lib', 'i18n'), ['.ts']).concat(
  listFiles(path.join(APP_ROOT, 'src', 'i18n'), ['.json'])
);

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

describe('the old support address', () => {
  const html = renderToStaticMarkup(React.createElement(DonatePage));
  const title = String(donateMetadata.title ?? '');
  const description = String(donateMetadata.description ?? '');

  it('asks for no money and links About', () => {
    expect(html).toContain('href="/about/"');
    for (const text of [html, title, description]) {
      expect(text).not.toMatch(/sponsor|donat|tax-deductible|non-?profit|\bcharit/i);
    }
  });

  it('is kept out of search results and the sitemap', () => {
    expect(donateMetadata.robots).toMatchObject({ index: false });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sitemap = require('@/app/sitemap').default as () => Array<{ url: string }>;
    expect(sitemap().map((e) => e.url).filter((u) => /\/donate\b/.test(u))).toEqual([]);
  });

  it('makes no percentage pledge', () => {
    for (const text of [html, description]) {
      expect(text).not.toMatch(/\d+\s*%\s+(of|for)\b|\b(donate|pledge|route)\w*\s+\d+\s*%/i);
      expect(text).not.toMatch(/\bten percent\b/i);
    }
  });
});

describe('no page or doc makes a pledge or a charity claim', () => {
  it('no page or doc gives the pledge as a percentage', () => {
    expect(
      filesMatching(VISITOR_TEXT_FILES, /10%\s*for\s*Humanity|\bten percent\b|10% of (all|every|our)|donate 10%/i)
    ).toEqual([]);
  });

  it('no page or doc calls SafeOS or its maker a nonprofit or a charity', () => {
    expect(filesMatching(VISITOR_TEXT_FILES, /non-?profit|\bcharit(y|ies|able)\b/i)).toEqual([]);
  });

  it('no translation gives the pledge as a percentage or names SuperCloud', () => {
    // Every language writes the pledge's number as 10 and a percent sign.
    expect(filesMatching(TRANSLATION_FILES, /(^|[^\d])10\s*%|SuperCloud/)).toEqual([]);
  });

  it('package.json names the framerslab repository', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.repository?.url).toMatch(/github\.com\/framerslab\/safeos/);
  });

  it('no FUNDING entry points at an account that is not framerslab', () => {
    const funding = fs.readFileSync(path.join(REPO_ROOT, '.github', 'FUNDING.yml'), 'utf8');
    expect(funding).not.toMatch(/framersai|manicinc/);
    expect(funding).toMatch(/framerslab/);
  });
});

describe('sitemap', () => {
  it('lists only pages the site builds', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sitemap = require('@/app/sitemap').default as () => Array<{ url: string }>;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateStaticParams } = require('@/app/blog/[slug]/page') as {
      generateStaticParams: () => Array<{ slug: string }>;
    };
    const builtPosts = new Set(generateStaticParams().map((p) => p.slug));
    const missing: string[] = [];
    for (const { url } of sitemap()) {
      const route = new URL(url).pathname.replace(/^\/|\/$/g, '');
      const post = route.match(/^blog\/([^/]+)$/);
      if (post) {
        if (!builtPosts.has(post[1])) missing.push(url);
        continue;
      }
      const pageFile = path.join(APP_ROOT, 'src', 'app', route, 'page.tsx');
      if (!fs.existsSync(pageFile)) missing.push(url);
    }
    expect(missing).toEqual([]);
  });
});

describe('storage and network statements', () => {
  const PAGES = listFiles(path.join(APP_ROOT, 'src', 'app'), ['.tsx']);

  it('settings are kept in localStorage, so no page says they are in IndexedDB', () => {
    // stores/settings-store.ts persists with createJSONStorage(() => localStorage).
    const store = fs.readFileSync(path.join(APP_ROOT, 'src', 'stores', 'settings-store.ts'), 'utf8');
    expect(store).toMatch(/createJSONStorage\(\(\) => localStorage\)/);
    expect(filesMatching(PAGES, /settings(?:(?!localStorage)[^.'"]){0,80}\bin (your browser(&apos;|'|\\')s )?IndexedDB/i)).toEqual([]);
  });

  it('no page says nothing goes anywhere: the model download and the star count reach Google and GitHub', () => {
    expect(filesMatching(PAGES, /nothing is sent anywhere|nowhere else|Nothing is sent to remote servers/i)).toEqual([]);
  });

  it('the home page diagram routes no low-confidence detection anywhere: no mode has a second model', () => {
    const svg = fs.readFileSync(path.join(APP_ROOT, 'public', 'diagrams', 'how-it-works.svg'), 'utf8');
    expect(svg).not.toMatch(/low-conf/i);
  });
});

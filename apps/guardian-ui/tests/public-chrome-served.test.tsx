/** @jest-environment node */
/**
 * The public header, its Menu, the footer and About's part on who builds
 * SafeOS, as they are served
 *
 * Renders each to the HTML a browser gets before any script runs, with the
 * two values the build is handed (the repository's star count and the day it
 * was counted) set, unset and wrong. The row's links stand in their order;
 * the GitHub link carries its count in the HTML and is named by its own
 * content; the footer shows the makers by their own files and says the count
 * in a sentence with its day; About tells who builds SafeOS once. Nothing
 * here asks another host anything: the count is in the page. The FAQ, the
 * blog and a post are rendered too: every key at their foot is one of the
 * set, and none is a filled box drawn by hand.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VisitorHeader } from '@/components/visitor/VisitorHeader';
import { VisitorFooter } from '@/components/visitor/VisitorFooter';
import AboutPage from '@/app/about/page';
import FAQPage from '@/app/faq/page';
import BlogPage from '@/app/blog/page';
import BlogArticlePage, { generateStaticParams } from '@/app/blog/[slug]/page';
import { bare, served, words } from './helpers/served-html';

let mockPath = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

// next/image reads the browser's address, which this server render has none of.
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => React.createElement('img', { src, alt }),
}));

const APP_ROOT = path.resolve(__dirname, '..');
const REPOSITORY = 'https://github.com/framerslab/safeos';

/** Each maker's mark as its own site serves it, with the sha256 of that file. */
const MARKS: Record<string, string> = {
  'frame-icon-dark.svg': '66066bf25e486e910df23107ba03a33819fac91f28e4c7a76934028ecd83e304',
  'frame-icon-light.svg': 'ee3b27e72300913a5a1dd404e4944e87317164c7ef23eb284088b5e575b25924',
  'agentos-icon.svg': 'd0c00ba0c53d0a615a8ac08bd23a7728eaa6dc10a2c746fb03bfb546a37fb025',
  'paracosm-icon-color.svg': '8d74f718546bc0fb1ceee27541fb38dfbf797c743d9ba3d37df1d24c46446ca5',
  'paracosm-icon-color-light.svg': 'b0a648af1ba6bd16165cc654c5af9b05ad98429aa44d5344c78fb8ac82a1e4cc',
};
const MARKS_OF: Record<string, string[]> = {
  Frame: ['/logos/frame-icon-dark.svg', '/logos/frame-icon-light.svg'],
  AgentOS: ['/logos/agentos-icon.svg'],
  Paracosm: ['/logos/paracosm-icon-color.svg', '/logos/paracosm-icon-color-light.svg'],
};

const COUNT = 'NEXT_PUBLIC_GITHUB_STARS';
const DAY = 'NEXT_PUBLIC_GITHUB_STARS_DATE';

/** Sets the two values as the build would have them, for the renders that follow. */
function handed(count: string | undefined, day: string | undefined) {
  if (count === undefined) delete process.env[COUNT];
  else process.env[COUNT] = count;
  if (day === undefined) delete process.env[DAY];
  else process.env[DAY] = day;
}

const header = (pathname = '/') => {
  mockPath = pathname;
  return served(renderToStaticMarkup(<VisitorHeader />));
};
const footer = () => served(renderToStaticMarkup(<VisitorFooter />));
const about = () => {
  mockPath = '/about';
  return served(renderToStaticMarkup(<AboutPage />));
};

/** What a person sees of an element: its words without the ones kept for a screen reader. */
function shown(element: Element | null | undefined): string {
  if (!element) return '';
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('.sr-only').forEach((part) => part.remove());
  return words(copy);
}

/** A link's name: its label when it has one, otherwise its own content without what is hidden from assistive technology. */
function nameOf(element: Element | null | undefined): string {
  if (!element) return '';
  const label = element.getAttribute('aria-label');
  if (label) return label;
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((part) => part.remove());
  return words(copy);
}

/** A link's description: the words of the element it points at. */
function descriptionOf(element: Element | null | undefined): string {
  const id = element?.getAttribute('aria-describedby');
  return id ? words(element?.ownerDocument.getElementById(id)) : '';
}

const fetchMock = jest.fn(() => Promise.reject(new Error('a served page asks no host anything')));
const realFetch = global.fetch;

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
  handed(undefined, undefined);
});

describe('with 58 stars counted on 18 November 2026', () => {
  beforeEach(() => handed('58', '2026-11-18'));

  it('lists the row\'s links in order: How it works, Uses, Guides, FAQ, Privacy', () => {
    const links = Array.from(header().querySelectorAll('.site-header__links a'));
    expect(links.map((link) => `${words(link)} ${bare(link.getAttribute('href'))}`)).toEqual([
      'How it works /#how-it-works',
      'Uses /#uses',
      'Guides /tutorials',
      'FAQ /faq',
      'Privacy /privacy',
    ]);
  });

  it('marks Guides, FAQ and Privacy as the page being read on their own pages', () => {
    const current = (pathname: string) =>
      Array.from(header(pathname).querySelectorAll('.site-header__links [aria-current="page"]')).map(words);
    expect(current('/tutorials/')).toEqual(['Guides']);
    expect(current('/faq/')).toEqual(['FAQ']);
    expect(current('/privacy/')).toEqual(['Privacy']);
    expect(current('/')).toEqual([]);
  });

  it('serves the desktop GitHub mark and the star count of 58 in one link', () => {
    const page = header();
    const html = page.body.innerHTML;
    const link = page.querySelector('.site-header__bar .site-header__github');
    expect(link?.getAttribute('href')).toBe(REPOSITORY);
    expect(link?.hasAttribute('target')).toBe(false);
    expect(shown(link)).toBe('GitHub 58');
    expect(nameOf(link)).toBe('SafeOS on GitHub, 58 stars');
    expect(descriptionOf(link)).toBe('Counted 18 November 2026.');
    // The number is in the served HTML, in tabular figures.
    expect(html).toMatch(/<span class="num">58<\/span>/);
    expect(link?.querySelectorAll('svg')).toHaveLength(2);
    expect(link?.querySelector('svg.github-mark')?.getAttribute('aria-hidden')).toBe('true');
    expect(link?.querySelector('svg.star-count__star')?.getAttribute('aria-hidden')).toBe('true');
    expect(link?.querySelector('img')).toBeNull();
    // It stands between the links and the look switch's place, and is never the page being read.
    const order = Array.from(page.querySelectorAll('.site-header__bar .site-header__links, .site-header__bar .site-header__github, .site-header__bar .look-switch-place')).map((item) =>
      item.matches('.site-header__links') ? 'the links' : item.matches('.site-header__github') ? 'GitHub' : 'the look switch',
    );
    expect(order).toEqual(['the links', 'GitHub', 'the look switch']);
    expect(link?.hasAttribute('aria-current')).toBe(false);
  });

  it('lists the Menu\'s nine rows, the start key first and GitHub with its count last', () => {
    const page = header();
    const rows = Array.from(page.querySelectorAll('#site-menu a'));
    expect(rows.map(shown)).toEqual(['Start setup', 'How it works', 'Uses', 'Guides', 'FAQ', 'Privacy', 'About SafeOS', 'Blog', 'GitHub 58']);
    expect(rows.map((row) => bare(row.getAttribute('href')))).toEqual([
      '/setup',
      '/#how-it-works',
      '/#uses',
      '/tutorials',
      '/faq',
      '/privacy',
      '/about',
      '/blog',
      REPOSITORY,
    ]);
    const last = rows[rows.length - 1];
    expect(nameOf(last)).toBe('SafeOS on GitHub 58 stars');
    expect(descriptionOf(last)).toBe('Counted 18 November 2026.');
    expect(last.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
    // The two GitHub links of the header are described by two elements, each with its own id.
    const ids = Array.from(page.querySelectorAll('[aria-describedby]')).map((item) => item.getAttribute('aria-describedby'));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('follows the footer\'s GitHub link with the same star and count, and says the count with its day in the last line', () => {
    const page = footer();
    const link = page.querySelector(`.site-footer__groups a[href="${REPOSITORY}"]`);
    expect(shown(link)).toBe('SafeOS on GitHub 58');
    expect(nameOf(link)).toBe('SafeOS on GitHub 58 stars');
    expect(descriptionOf(link)).toBe('Counted 18 November 2026.');
    expect(link?.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
    const last = page.querySelector('.site-footer__last');
    expect(words(last)).toBe(`© ${new Date().getFullYear()} Frame. SafeOS code is MIT-licensed. 58 stars on GitHub, counted 18 November 2026.`);
    // The sentence is words: the last line holds no link.
    expect(last?.querySelector('a')).toBeNull();
  });

  it('shows the three makers in the footer, each one link of its own mark and its name', () => {
    const page = footer();
    const groups = Array.from(page.querySelectorAll('.site-footer__groups > div'));
    const makers = groups[groups.length - 1];
    expect(words(makers.querySelector('h2'))).toBe('From Frame');
    const rows = Array.from(makers.querySelectorAll('li > a'));
    expect(rows.map((row) => `${nameOf(row)} ${row.getAttribute('href')}`)).toEqual([
      'Frame https://frame.dev',
      'AgentOS https://agentos.sh',
      'Paracosm https://paracosm.agentos.sh',
    ]);
    for (const row of rows) {
      const images = Array.from(row.querySelectorAll('img'));
      expect(images.map((image) => image.getAttribute('src'))).toEqual(MARKS_OF[words(row)]);
      for (const image of images) {
        // The name beside the mark is text and names the link.
        expect(image.getAttribute('alt')).toBe('');
        expect(image.getAttribute('width')).toBe('24');
        expect(image.getAttribute('height')).toBe('24');
        expect(image.getAttribute('loading')).toBe('lazy');
      }
      expect(row.hasAttribute('target')).toBe(false);
      expect(row.querySelector('svg')).toBeNull();
    }
  });

  it('serves each maker\'s mark as the file its own site serves, byte for byte', () => {
    const used = Array.from(footer().querySelectorAll('.site-footer__groups img')).map((image) => image.getAttribute('src'));
    expect(used.sort()).toEqual(Object.keys(MARKS).map((file) => `/logos/${file}`).sort());
    for (const [file, sha256] of Object.entries(MARKS)) {
      const bytes = fs.readFileSync(path.join(APP_ROOT, 'public', 'logos', file));
      expect(`${file} ${crypto.createHash('sha256').update(bytes).digest('hex')}`).toBe(`${file} ${sha256}`);
    }
    // The square letter F was never Frame's mark.
    expect(fs.existsSync(path.join(APP_ROOT, 'public', 'logos', 'frame.svg'))).toBe(false);
  });

  it('tells who builds SafeOS once on About, under the makers\' own marks', () => {
    const page = about();
    const text = words(page.body);
    expect(text.match(/Who builds SafeOS/gi)).toHaveLength(1);
    expect(text).not.toMatch(/Who Builds It|Built by Frame\.dev|Visit Frame\.dev|Makers of SafeOS and AgentOS/);
    expect(page.querySelector('img[src*="/logos/frame.svg"]')).toBeNull();

    const part = page.querySelector('section.who-builds');
    expect(words(part?.querySelector('h2'))).toBe('Who builds SafeOS');
    expect(part?.querySelectorAll('h2')).toHaveLength(1);
    const entries = Array.from(part?.querySelectorAll('.who-builds__entry') || []);
    expect(entries.map((entry) => words(entry.querySelector('h3')))).toEqual(['Frame', 'AgentOS', 'Paracosm']);
    expect(entries.map((entry) => words(entry.querySelector('p')))).toEqual([
      'Frame builds SafeOS and pays for its development, so an old phone or laptop can watch a room, a porch or a yard for free.',
      'An open-source framework for building software agents in TypeScript.',
      'An open-source simulator that plays out what-if questions with software agents.',
    ]);
    expect(words(part?.querySelector('.who-builds__also'))).toBe('Also from Frame');
    // One link row an entry, named by its address, opening in the same tab.
    const rows = Array.from(part?.querySelectorAll('a') || []);
    expect(rows.map((row) => `${nameOf(row)} ${row.getAttribute('href')} ${row.className}`)).toEqual([
      'frame.dev https://frame.dev link-row',
      'agentos.sh https://agentos.sh link-row',
      'paracosm.agentos.sh https://paracosm.agentos.sh link-row',
    ]);
    expect(part?.querySelectorAll('a[target]')).toHaveLength(0);
    // The same five files as the footer's, at 40 px, and no mark is a link.
    entries.forEach((entry) => {
      const images = Array.from(entry.querySelectorAll('img'));
      expect(images.map((image) => image.getAttribute('src'))).toEqual(MARKS_OF[words(entry.querySelector('h3'))]);
      for (const image of images) {
        expect(image.getAttribute('alt')).toBe('');
        expect(image.getAttribute('width')).toBe('40');
        expect(image.getAttribute('height')).toBe('40');
        expect(image.getAttribute('loading')).toBe('lazy');
        expect(image.closest('a')).toBeNull();
      }
    });
  });

  it('asks no host anything, and names no badge or API address in the served HTML', () => {
    const html = [header().body.innerHTML, footer().body.innerHTML, about().body.innerHTML].join('\n');
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(html).not.toMatch(/api\.github\.com|shields\.io|img\.shields|githubusercontent|buttons\.github\.io/);
    // The number is written once a place it stands, and never typed into a source file.
    for (const file of ['src/components/visitor/VisitorHeader.tsx', 'src/components/visitor/VisitorFooter.tsx', 'src/lib/github-stars.ts']) {
      expect(fs.readFileSync(path.join(APP_ROOT, file), 'utf8')).not.toMatch(/\b58\b/);
    }
  });
});

describe('with a larger count', () => {
  it('shows the short form, cut down, and gives the exact number to a screen reader and to the footer\'s sentence', () => {
    handed('1234', '2026-11-18');
    const row = header().querySelector('.site-header__bar .site-header__github');
    expect(shown(row)).toBe('GitHub 1.2k');
    expect(nameOf(row)).toBe('SafeOS on GitHub 1.2k stars');
    expect(descriptionOf(row)).toBe('1,234 stars, counted 18 November 2026.');
    expect(words(footer().querySelector('.site-footer__last'))).toMatch(/MIT-licensed\. 1,234 stars on GitHub, counted 18 November 2026\.$/);
  });

  it('says "1 star" of one', () => {
    handed('1', '2026-01-02');
    const row = header().querySelector('.site-header__bar .site-header__github');
    expect(nameOf(row)).toBe('SafeOS on GitHub 1 star');
    expect(descriptionOf(row)).toBe('Counted 2 January 2026.');
    expect(words(footer().querySelector('.site-footer__last'))).toMatch(/MIT-licensed\. 1 star on GitHub, counted 2 January 2026\.$/);
  });
});

describe.each([
  ['no value', undefined, undefined],
  ['a count of 0', '0', '2026-11-18'],
  ['a count of "abc"', 'abc', '2026-11-18'],
  ['a count of -3', '-3', '2026-11-18'],
  ['a count of 58.5', '58.5', '2026-11-18'],
  ['a count with no day', '58', undefined],
  ['a count with a day that is none', '58', '2026-13-45'],
])('with %s', (_name, count, day) => {
  beforeEach(() => handed(count, day));

  it('shows the word GitHub alone in the row and in the Menu, named "SafeOS on GitHub", with no star', () => {
    const page = header();
    const links = [page.querySelector('.site-header__bar .site-header__github'), page.querySelector(`#site-menu a[href="${REPOSITORY}"]`)];
    for (const link of links) {
      expect(shown(link)).toBe('GitHub');
      expect(nameOf(link)).toBe('SafeOS on GitHub');
      expect(descriptionOf(link)).toBe('');
      expect(link?.querySelector('svg, img')).toBeNull();
    }
    expect(page.body.innerHTML).not.toMatch(/\bstars?\b|Counted/i);
  });

  it('shows the footer\'s link with no star and ends the last line at the licence', () => {
    const page = footer();
    const link = page.querySelector(`.site-footer__groups a[href="${REPOSITORY}"]`);
    expect(shown(link)).toBe('SafeOS on GitHub');
    expect(nameOf(link)).toBe('SafeOS on GitHub');
    expect(link?.querySelector('svg, img')).toBeNull();
    expect(words(page.querySelector('.site-footer__last'))).toBe(`© ${new Date().getFullYear()} Frame. SafeOS code is MIT-licensed.`);
    expect(words(page.body)).not.toMatch(/stars? on GitHub|counted/i);
  });
});

describe('the keys of the FAQ, the blog and a post', () => {
  beforeEach(() => handed(undefined, undefined));

  const faq = () => served(renderToStaticMarkup(<FAQPage />));
  const blog = () => served(renderToStaticMarkup(<BlogPage />));
  const post = () => served(renderToStaticMarkup(<BlogArticlePage params={{ slug: generateStaticParams()[0].slug }} />));

  /** The links and buttons of a page's own content; its top bar holds no key. */
  const controls = (page: Document) => Array.from(page.querySelectorAll('a, button')).filter((control) => !control.closest('header'));

  /** Each named control with the classes it carries. */
  const kinds = (page: Document, names: string[]) =>
    names.map(
      (name) =>
        `${name}: ${controls(page)
          .filter((control) => words(control) === name)
          .map((control) => control.className)
          .join(' | ')}`,
    );

  it('ends the FAQ on the solid key with the outlined key beside it, then two link rows', () => {
    expect(kinds(faq(), ['Email team@frame.dev', 'Open GitHub Issue', 'About SafeOS', 'Read Our Blog'])).toEqual([
      'Email team@frame.dev: key key--solid',
      'Open GitHub Issue: key key--outline',
      'About SafeOS: link-row',
      'Read Our Blog: link-row',
    ]);
  });

  it('ends the blog on the outlined key beside the solid key, then two link rows', () => {
    expect(kinds(blog(), ['SafeOS on GitHub', 'Visit Frame.dev', 'About SafeOS', 'FAQ'])).toEqual([
      'SafeOS on GitHub: key key--outline',
      'Visit Frame.dev: key key--solid',
      'About SafeOS: link-row',
      'FAQ: link-row',
    ]);
  });

  it('ends a post on two link rows', () => {
    expect(kinds(post(), ['All Posts', 'About SafeOS'])).toEqual(['All Posts: link-row', 'About SafeOS: link-row']);
  });

  it.each([
    ['the FAQ', faq],
    ['the blog', blog],
    ['a post', post],
  ])('draws no key by hand on %s: a link or button with a fill and padding of its own is a key', (_name, page) => {
    const drawn = controls(page()).filter((control) => {
      const classes = control.className.split(/\s+/);
      return classes.some((name) => /^bg-[a-z]+-\d+$/.test(name)) && classes.some((name) => /^px-\d/.test(name)) && !classes.includes('key');
    });
    expect(drawn.map((control) => `${words(control)}: ${control.className}`)).toEqual([]);
  });
});

/** @jest-environment node */
/**
 * The visitor header and footer as they are served
 *
 * Renders both to the HTML a browser gets before any script runs. The header
 * is a navigation named "Site" with the mark, five links,
 * the GitHub link and the start key as working links, and Menu as a link to
 * the footer's links; the look switch has only its place held.
 * The footer is six small groups of links in a navigation named
 * "Site links" and one last line.
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VisitorHeader } from '@/components/visitor/VisitorHeader';
import { VisitorFooter } from '@/components/visitor/VisitorFooter';
import { isHomeRoute, isVisitorRoute } from '@/lib/visitor-routes';
import { bare, served, words } from './helpers/served-html';

let mockPath = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const header = (pathname = '/') => {
  mockPath = pathname;
  return served(renderToStaticMarkup(<VisitorHeader />));
};

describe('visitor header, before script runs', () => {
  it('is a navigation named "Site" whose items are the mark, five links, GitHub and the start key, in that order', () => {
    const page = header();
    const nav = page.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Site');
    const bar = Array.from(page.querySelectorAll('.site-header__bar a, .site-header__bar button'));
    expect(bar.map((item) => `${item.getAttribute('aria-label') || words(item)} ${bare(item.getAttribute('href'))}`)).toEqual([
      'SafeOS Guardian, home /',
      'How it works /#how-it-works',
      'Uses /#uses',
      'Guides /tutorials',
      'FAQ /faq',
      'Privacy /privacy',
      'SafeOS on GitHub https://github.com/framerslab/safeos',
      'Start setup /setup',
      'Menu #site-links',
    ]);
    // Every item is a working link before script: none is a button.
    expect(page.querySelectorAll('.site-header__bar button')).toHaveLength(0);
  });

  it('shows the wordmark as live text, "SafeOS" over "Guardian", and draws the mark inline as decoration', () => {
    const page = header();
    const brand = page.querySelector('.site-header__brand');
    expect(Array.from(brand?.querySelectorAll('.wordmark span') || []).map(words)).toEqual(['SafeOS', 'Guardian']);
    expect(brand?.querySelector('.wordmark')?.getAttribute('translate')).toBe('no');
    expect(brand?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(brand?.querySelector('img')).toBeNull();
  });

  it('marks the page being read: the mark on the home page, the link on Privacy and on the FAQ', () => {
    const current = (pathname: string) =>
      Array.from(header(pathname).querySelectorAll('.site-header__bar [aria-current="page"]')).map((item) => item.getAttribute('aria-label') || words(item));
    expect(current('/')).toEqual(['SafeOS Guardian, home']);
    expect(current('/privacy/')).toEqual(['Privacy']);
    expect(current('/faq')).toEqual(['FAQ']);
    expect(current('/about/')).toEqual([]);
  });

  it('names the GitHub link "SafeOS on GitHub", shows the word alone with no logo, and opens it in the same tab', () => {
    const link = header().querySelector('.site-header__github');
    expect(link?.getAttribute('aria-label')).toBe('SafeOS on GitHub');
    expect(words(link)).toBe('GitHub');
    expect(link?.querySelector('svg, img')).toBeNull();
    expect(link?.hasAttribute('target')).toBe(false);
  });

  it('holds no bell, no keyboard-shortcuts key and no sign-in', () => {
    const page = header();
    expect(page.querySelector('[aria-label="Help"], [aria-label*="otification"]')).toBeNull();
    expect(words(page.body)).not.toMatch(/Dashboard|Monitor|History|Settings|Sign in|Log in/);
  });

  it('lists the start link, the five links, About SafeOS, Blog and GitHub as the rows of the Menu, closed', () => {
    const page = header();
    const menu = page.querySelector('#site-menu');
    expect(menu?.hasAttribute('hidden')).toBe(true);
    expect(Array.from(menu?.querySelectorAll('a') || []).map(words)).toEqual(['Start setup', 'How it works', 'Uses', 'Guides', 'FAQ', 'Privacy', 'About SafeOS', 'Blog', 'GitHub']);
  });
});

describe('look switch, before script runs', () => {
  it('holds the key\'s place empty and shows no switch', () => {
    const page = header();
    expect(page.querySelector('.look-switch')).toBeNull();
    const place = page.querySelector('.look-switch-place');
    expect(place?.getAttribute('aria-hidden')).toBe('true');
    expect(words(place)).toBe('');
  });

  it('declares each look\'s page colour for the browser\'s own bar and follows the device through CSS alone', () => {
    const layout = fs.readFileSync(path.join(REPO_ROOT, 'apps', 'guardian-ui', 'src', 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain("{ media: '(prefers-color-scheme: dark)', color: LOOK_PAGE_COLOURS.dark }");
    expect(layout).toContain("{ media: '(prefers-color-scheme: light)', color: LOOK_PAGE_COLOURS.light }");
    const styles = fs.readFileSync(path.join(REPO_ROOT, 'apps', 'guardian-ui', 'src', 'styles', 'visitor.css'), 'utf8');
    expect(styles).toMatch(/@media \(prefers-color-scheme: light\) \{\s*html:not\(\.dark\):not\(\.light\):has\(\.device-look\)/);
  });
});

describe('footer', () => {
  const page = served(renderToStaticMarkup(<VisitorFooter />));
  const groups = Array.from(page.querySelectorAll('nav > div'));
  const links = (group: Element) =>
    Array.from(group.querySelectorAll('a')).map((link) => `${words(link)} ${bare(link.getAttribute('href'))}`);

  it('is a content-info landmark that holds a navigation named "Site links"', () => {
    expect(page.querySelectorAll('footer')).toHaveLength(1);
    const nav = page.querySelector('footer nav');
    expect(nav?.getAttribute('aria-label')).toBe('Site links');
    // The header's Menu link lands here before script runs.
    expect(nav?.id).toBe('site-links');
  });

  it('gives six groups, each a heading and a list, with Privacy and Terms among them', () => {
    expect(groups.map((group) => words(group.querySelector('h2')))).toEqual(['Use it', 'Uses', 'Learn', 'About', 'Legal', 'From Frame']);
    for (const group of groups) expect(group.querySelectorAll('ul > li > a').length).toBe(group.querySelectorAll('a').length);
    expect(links(groups[0])).toEqual(['Start setup /setup']);
    expect(links(groups[1])).toEqual([
      "A baby's nap /#baby-nap",
      'A pet while you are out /#pet-out',
      'An elderly parent /#elderly-parent',
      'A lost pet near home /#lost-pet',
      'Backyard wildlife /#wildlife',
    ]);
    expect(links(groups[2])).toEqual(['How it works /#how-it-works', 'Guides /tutorials', 'FAQ /faq', 'Help /help', 'Blog /blog']);
    expect(links(groups[3])).toEqual([
      'About SafeOS /about',
      'SafeOS on GitHub https://github.com/framerslab/safeos',
      'Discord https://wilds.ai/discord',
      'team@frame.dev mailto:team@frame.dev',
    ]);
    expect(links(groups[4])).toEqual([
      'Privacy /privacy',
      'Terms /terms',
      'MIT License https://github.com/framerslab/safeos/blob/master/LICENSE',
      'Security policy https://github.com/framerslab/safeos/blob/master/SECURITY.md',
    ]);
    expect(links(groups[5])).toEqual(['Frame https://frame.dev', 'AgentOS https://agentos.sh', 'Paracosm https://paracosm.agentos.sh']);
  });

  it('links only files and pages that exist, and opens every link in the same tab', () => {
    for (const target of ['LICENSE', 'SECURITY.md']) expect(fs.existsSync(path.join(REPO_ROOT, target))).toBe(true);
    for (const route of ['tutorials', 'faq', 'help', 'blog', 'about', 'privacy', 'terms', 'setup']) {
      expect(fs.existsSync(path.join(REPO_ROOT, 'apps', 'guardian-ui', 'src', 'app', route, 'page.tsx'))).toBe(true);
    }
    expect(page.querySelectorAll('a[target]')).toHaveLength(0);
  });

  it('shows the brand block, with the mark as decoration, and the last line with the year of the build', () => {
    expect(Array.from(page.querySelectorAll('.site-footer__brand p')).map(words)).toEqual([
      'SafeOS Guardian',
      'Motion and sound alerts that run in your browser.',
    ]);
    expect(page.querySelector('.site-footer__brand svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(words(page.querySelector('.site-footer__last'))).toBe(`© ${new Date().getFullYear()} Frame. SafeOS code is MIT-licensed.`);
  });

  it('shows no status line, no pill and no claim to all rights', () => {
    expect(words(page.body)).not.toMatch(/All systems operational|Humanitarian|All rights reserved/i);
    expect(page.querySelector('[class*="animate-pulse"]')).toBeNull();
  });
});

describe('the pages that carry the visitor header and footer', () => {
  it('are the home page and the public pages; app screens keep their own header', () => {
    for (const pathname of ['/', '/about/', '/faq', '/help/integrations/telegram/', '/tutorials/', '/tutorial', '/blog/how-safeos-guardian-works/', '/privacy/', '/terms/']) {
      expect(isVisitorRoute(pathname)).toBe(true);
    }
    for (const pathname of ['/dashboard/', '/monitor', '/history/', '/settings/notifications/', '/setup/', '/security/', '/wildlife/', '/lost-found/', '/nap/', '/tutorialsx']) {
      expect(isVisitorRoute(pathname)).toBe(false);
    }
    expect(isHomeRoute('/')).toBe(true);
    expect(isHomeRoute('/faq/')).toBe(false);
  });
});

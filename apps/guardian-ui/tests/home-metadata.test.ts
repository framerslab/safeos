/** @jest-environment node */
/**
 * What a search result and a shared link show of the home page (feature 14)
 *
 * The title, the description, the canonical address and the cards come from
 * the one owner of titles and cards, lib/page-metadata, which the home page
 * calls as the other public pages do. The card picture is the JPEG saved
 * from the real capture when that file exists. The structured data says what
 * the page says, the web app manifest describes the same app, and the sitemap
 * gives the home page the day its own files last changed.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage, { metadata } from '@/app/page';
import sitemap from '@/app/sitemap';
import { metadata as faqMetadata } from '@/app/faq/layout';
import { CARD_ALT, HOME_DESCRIPTION, HOME_FULL_TITLE, HOME_TITLE, pageMetadata, socialImage } from '@/lib/page-metadata';
import { HOME_LAST_CHANGED, PAGE_LAST_CHANGED } from '@/lib/page-last-changed';
import appPackage from '../package.json';
import { served, words } from './helpers/served-html';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const APP_ROOT = path.resolve(__dirname, '..');
const page = served(renderToStaticMarkup(React.createElement(HomePage)));
const blocks = Array.from(page.querySelectorAll('script[type="application/ld+json"]')).map(
  (script) => JSON.parse(script.textContent || '{}') as Record<string, unknown>
);

describe('feature 14: the search result', () => {
  it('titles the page with the H1\'s words and the suffix every public page carries', () => {
    expect(HOME_TITLE).toBe('Free motion and sound alerts from an old phone or laptop');
    expect(HOME_FULL_TITLE).toBe('Free motion and sound alerts from an old phone or laptop | SafeOS Guardian');
    expect(HOME_FULL_TITLE).toHaveLength(74);
    // The home page sits beside the root layout, where its template does not apply.
    expect(metadata.title).toEqual({ absolute: HOME_FULL_TITLE });
    expect(words(page.querySelector('h1'))).toBe(HOME_TITLE);
    // The words that matter come first.
    expect(HOME_FULL_TITLE.slice(0, 40)).toBe('Free motion and sound alerts from an old');
    // A page below the root keeps its own title, and the layout's template adds the suffix.
    expect(faqMetadata.title).toBe('FAQ');
  });

  it('describes the page in 146 characters that lead with what a person gets', () => {
    expect(metadata.description).toBe(
      'Get motion and sound alerts from an old phone, tablet or laptop. SafeOS Guardian runs in your browser, free and open source under the MIT License.'
    );
    expect(HOME_DESCRIPTION).toHaveLength(146);
  });

  it('gives https://safeos.sh/ as the canonical address and no keywords', () => {
    expect(metadata.alternates).toEqual({ canonical: '/' });
    expect(metadata.keywords).toBeUndefined();
    const layout = fs.readFileSync(path.join(APP_ROOT, 'src', 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain("metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://safeos.sh')");
    expect(layout).not.toMatch(/keywords/);
    // The layout's defaults are the helper's own values, not a second copy.
    expect(layout).toContain('default: HOME_FULL_TITLE');
    expect(layout).toContain('description: HOME_DESCRIPTION');
  });

  it('leads with no absence claim, no health word and no "AI"', () => {
    for (const text of [HOME_FULL_TITLE, HOME_DESCRIPTION, CARD_ALT]) {
      expect(text).not.toMatch(/\bAI\b|no account|nothing|never|private|medical|baby|breath/i);
    }
  });
});

describe('feature 14: the shared-link card', () => {
  it('is the JPEG saved from the real capture when that file exists, for the Open Graph and the X card alike', () => {
    const withCard = fs.mkdtempSync(path.join(os.tmpdir(), 'safeos-card-'));
    fs.mkdirSync(path.join(withCard, 'home'));
    fs.writeFileSync(path.join(withCard, 'home', 'card.jpg'), 'card');
    expect(socialImage(withCard)).toEqual({
      url: '/home/card.jpg',
      width: 1200,
      height: 630,
      alt: 'SafeOS Guardian watching a recorded clip of a kitten, beside the words Free motion and sound alerts from an old phone or laptop.',
      type: 'image/jpeg',
    });
    fs.rmSync(withCard, { recursive: true, force: true });
  });

  it('leaves the title and the description in place, with the earlier card, when the JPEG is missing', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'safeos-no-card-'));
    expect(socialImage(empty).url).toBe('/og-image.svg');
    expect(fs.existsSync(path.join(APP_ROOT, 'public', 'og-image.svg'))).toBe(true);
    fs.rmSync(empty, { recursive: true, force: true });
  });

  it('is committed, and the home page and every other public page show it', () => {
    expect(fs.existsSync(path.join(APP_ROOT, 'public', 'home', 'card.jpg'))).toBe(true);
    const cards = (meta: typeof metadata) => {
      const openGraph = meta.openGraph as unknown as { images: { url: string; alt: string; type: string }[]; title: string; description: string };
      const twitter = meta.twitter as unknown as { images: { url: string; alt: string }[]; title: string; card: string };
      return { openGraph, twitter };
    };
    for (const meta of [metadata, faqMetadata, pageMetadata({ title: 'About', description: 'About SafeOS.', path: '/about/' })]) {
      const { openGraph, twitter } = cards(meta);
      expect(openGraph.images).toEqual([{ url: '/home/card.jpg', width: 1200, height: 630, alt: CARD_ALT, type: 'image/jpeg' }]);
      expect(twitter.images).toEqual([{ url: '/home/card.jpg', alt: CARD_ALT }]);
      expect(twitter.card).toBe('summary_large_image');
    }
    const home = cards(metadata);
    expect(home.openGraph.title).toBe(HOME_FULL_TITLE);
    expect(home.openGraph.description).toBe(HOME_DESCRIPTION);
    expect(home.twitter.title).toBe(HOME_FULL_TITLE);
  });
});

describe('feature 14: structured data', () => {
  const application = blocks.find((block) => block['@type'] === 'WebApplication') || {};
  const organization = blocks.find((block) => block['@type'] === 'Organization') || {};

  it('is one WebApplication block and one Organization block, with no rating, review or FAQ block', () => {
    expect(blocks.map((block) => block['@type']).sort()).toEqual(['Organization', 'WebApplication']);
    const everything = JSON.stringify(blocks);
    expect(everything).not.toMatch(/SecurityApplication|BabyMonitor|aggregateRating|"review"|FAQPage|\bAI\b|COCO-SSD/);
  });

  it('says what the page says: the name, the description, a price of 0, the MIT licence and built features', () => {
    expect(application.name).toBe('SafeOS Guardian');
    expect(application.description).toBe(HOME_DESCRIPTION);
    expect(application.applicationCategory).toBe('UtilitiesApplication');
    expect(application.offers).toMatchObject({ price: '0', priceCurrency: 'USD' });
    expect(application.license).toBe('https://github.com/framerslab/safeos/blob/master/LICENSE');
    expect(application.url).toBe('https://safeos.sh/');
    expect((application.featureList as string[]).length).toBeGreaterThanOrEqual(4);
  });

  it('reads the version from the app\'s package file and the day of the last change from the page\'s own constant', () => {
    expect(application.softwareVersion).toBe(appPackage.version);
    expect(application.dateModified).toBe(HOME_LAST_CHANGED);
  });

  it('names Frame with the addresses the footer links to', () => {
    expect(organization.name).toBe('Frame');
    expect(organization.url).toBe('https://frame.dev');
    expect(organization.sameAs).toEqual([
      'https://github.com/framerslab/safeos',
      'https://agentos.sh',
      'https://paracosm.agentos.sh',
      'https://wilds.ai/discord',
    ]);
  });
});

describe('feature 14: the install entry and the sitemap', () => {
  it('describes the app in the manifest with the dark page colour and no health category', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'public', 'manifest.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest.name).toBe('SafeOS Guardian');
    expect(manifest.description).toBe('Motion and sound alerts that run in your browser. By Frame.');
    expect(manifest.categories).toEqual(['utilities', 'lifestyle']);
    expect(manifest.background_color).toBe('#0b131b');
    expect(manifest.theme_color).toBe('#0b131b');
  });

  it('lists the home page with the day its own files last changed, not the day of the build', () => {
    expect(HOME_LAST_CHANGED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PAGE_LAST_CHANGED['/']).toBe(HOME_LAST_CHANGED);
    const entries = sitemap();
    const home = entries.find((entry) => entry.url === 'https://safeos.sh/');
    expect(home?.lastModified).toEqual(new Date(`${HOME_LAST_CHANGED}T00:00:00Z`));
    // A page with no recorded day still gives the day of the build.
    const faq = entries.find((entry) => entry.url === 'https://safeos.sh/faq/');
    expect(Math.abs(new Date(faq?.lastModified as Date).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('keeps the forwarding page at /donate as it was, out of the sitemap and the navigation', () => {
    expect(sitemap().map((entry) => entry.url).filter((url) => /\/donate\b/.test(url))).toEqual([]);
    for (const file of [['src', 'components', 'visitor', 'VisitorHeader.tsx'], ['src', 'components', 'visitor', 'VisitorFooter.tsx'], ['src', 'app', 'page.tsx']]) {
      expect(fs.readFileSync(path.join(APP_ROOT, ...file), 'utf8')).not.toMatch(/\/donate\b/);
    }
    expect(fs.existsSync(path.join(APP_ROOT, 'src', 'app', 'donate', 'ForwardToAbout.tsx'))).toBe(true);
  });
});

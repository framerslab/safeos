/**
 * Page metadata
 *
 * The one owner of every public page's title and cards, the home page's
 * included. One call gives a page its own title, description, canonical
 * address, Open Graph card and X card. Next.js replaces a parent's
 * `openGraph` and `twitter` objects rather than merging them, so a page that
 * sets only a title and description would share another page's card; this
 * helper sets every field from the page's own values and keeps the site's
 * card picture.
 *
 * The card picture is the JPEG the Pictures workflow saves from the real
 * capture of the monitor (public/home/card.jpg). Until that file is
 * committed, the SVG card stands in.
 *
 * @module lib/page-metadata
 */

import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';

export const SITE_NAME = 'SafeOS Guardian';

/** The home page's headline; its title is these words and the site's suffix. */
export const HOME_TITLE = 'Free motion and sound alerts from an old phone or laptop';
export const HOME_FULL_TITLE = `${HOME_TITLE} | ${SITE_NAME}`;
export const HOME_DESCRIPTION =
  'Get motion and sound alerts from an old phone, tablet or laptop. SafeOS Guardian runs in your browser, free and open source under the MIT License.';

export const CARD_PATH = '/home/card.jpg';
export const CARD_ALT =
  'SafeOS Guardian watching a recorded clip of a kitten, beside the words Free motion and sound alerts from an old phone or laptop.';

const SVG_CARD = {
  url: '/og-image.svg',
  width: 1200,
  height: 630,
  alt: 'SafeOS Guardian: free, open-source monitor that runs in your browser, by Frame',
  type: 'image/svg+xml',
};

const JPEG_CARD = {
  url: CARD_PATH,
  width: 1200,
  height: 630,
  alt: CARD_ALT,
  type: 'image/jpeg',
};

/** The card picture every public page shows: the JPEG when the file exists. */
export function socialImage(publicDir: string = path.join(process.cwd(), 'public')) {
  return fs.existsSync(path.join(publicDir, 'home', 'card.jpg')) ? JPEG_CARD : SVG_CARD;
}

export interface PageMetadataInput {
  /** The page title; " | SafeOS Guardian" is added after it. */
  title: string;
  description: string;
  /** The page's address with a trailing slash, for example `/about/`. */
  path: string;
  /** Asks search engines not to index the page. */
  noIndex?: boolean;
  /** `article` for a blog post. */
  type?: 'website' | 'article';
  publishedTime?: string;
  authors?: string[];
  keywords?: string[];
}

export function pageMetadata({
  title,
  description,
  path: pagePath,
  noIndex = false,
  type = 'website',
  publishedTime,
  authors,
  keywords,
}: PageMetadataInput): Metadata {
  const socialTitle = `${title} | ${SITE_NAME}`;
  const image = socialImage();
  const card = {
    locale: 'en_US',
    siteName: SITE_NAME,
    url: pagePath,
    title: socialTitle,
    description,
    images: [image],
  };
  const openGraph: Metadata['openGraph'] =
    type === 'article' ? { ...card, type: 'article', publishedTime, authors } : { ...card, type: 'website' };
  return {
    // The root layout's template adds the suffix to every page below it. The
    // home page sits beside that layout, where the template does not apply,
    // so it carries the whole title itself.
    title: pagePath === '/' ? { absolute: socialTitle } : title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: pagePath },
    openGraph,
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [{ url: image.url, alt: image.alt }],
      creator: '@framerslab',
    },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}

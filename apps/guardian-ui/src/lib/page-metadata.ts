/**
 * Page metadata
 *
 * One call gives a public page its own title, description, canonical address,
 * Open Graph card and X card. Next.js replaces a parent's `openGraph` and
 * `twitter` objects rather than merging them, so a page that sets only a
 * title and description would share the home page's card; this helper sets
 * every field from the page's own values and keeps the site's card image.
 *
 * @module lib/page-metadata
 */

import type { Metadata } from 'next';

const SOCIAL_IMAGE = {
  url: '/og-image.svg',
  width: 1200,
  height: 630,
  alt: 'SafeOS Guardian: free, open-source monitor that runs in your browser, by Frame',
  type: 'image/svg+xml',
};

export interface PageMetadataInput {
  /** The page title; the root layout adds " | SafeOS Guardian". */
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
  path,
  noIndex = false,
  type = 'website',
  publishedTime,
  authors,
  keywords,
}: PageMetadataInput): Metadata {
  const socialTitle = `${title} | SafeOS Guardian`;
  const card = {
    locale: 'en_US',
    siteName: 'SafeOS Guardian',
    url: path,
    title: socialTitle,
    description,
    images: [SOCIAL_IMAGE],
  };
  const openGraph: Metadata['openGraph'] =
    type === 'article' ? { ...card, type: 'article', publishedTime, authors } : { ...card, type: 'website' };
  return {
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: path },
    openGraph,
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [SOCIAL_IMAGE.url],
      creator: '@framerslab',
    },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}

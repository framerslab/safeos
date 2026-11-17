/**
 * Dynamic robots.txt generation
 *
 * @module app/robots
 */

import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://safeos.sh').replace(/\/+$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The app's own pages are not listed here: each carries a noindex
        // tag, and a crawler that may not fetch a page never reads its tag.
        disallow: ['/api/', '/admin/', '/profiles/', '/export/', '/analytics/', '/webhooks/', '/nap/', '/private/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

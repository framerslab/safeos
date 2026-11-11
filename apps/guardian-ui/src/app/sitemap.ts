/**
 * Dynamic sitemap.xml generation
 *
 * @module app/sitemap
 */

import { MetadataRoute } from 'next';
import { generateStaticParams as blogPostParams } from './blog/[slug]/page';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://safeos.sh').replace(/\/+$/, '');
  const lastModified = new Date();

  const url = (path: string) => {
    const pathname = path.startsWith('/') ? path : `/${path}`;
    const withTrailingSlash = pathname === '/' ? '/' : pathname.endsWith('/') ? pathname : `${pathname}/`;
    return `${siteUrl}${withTrailingSlash}`;
  };

  const staticPages: Array<{
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
    priority: number;
  }> = [
    { path: '/', changeFrequency: 'weekly', priority: 1 },
    { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/faq', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/help', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/tutorials', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/blog', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/donate', changeFrequency: 'yearly', priority: 0.4 },
    { path: '/help/integrations', changeFrequency: 'monthly', priority: 0.5 },
  ];

  // Only posts the blog actually builds, so the sitemap never lists a missing page.
  const blogSlugs = blogPostParams().map((p) => p.slug);

  return [
    ...staticPages.map((p) => ({
      url: url(p.path),
      lastModified,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),
    ...blogSlugs.map((slug) => ({
      url: url(`/blog/${slug}`),
      lastModified,
      changeFrequency: 'yearly' as const,
      priority: 0.6,
    })),
  ];
}

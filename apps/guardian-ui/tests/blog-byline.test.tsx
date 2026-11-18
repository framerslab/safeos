/**
 * The blog is signed by the team
 *
 * The blog's page and every post name the Frame.dev Team as the author, in the
 * byline, the structured data, the page's metadata and the sign-off. No post
 * speaks as one person.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlogPage from '@/app/blog/page';
import BlogArticlePage, { generateMetadata, generateStaticParams } from '@/app/blog/[slug]/page';

const TEAM = 'Frame.dev Team';
const slugs = generateStaticParams().map(({ slug }) => slug);

it('names the team on the blog page and no person', () => {
  const html = renderToStaticMarkup(<BlogPage />);
  expect(html).toContain(TEAM);
  expect(html).toContain('/logos/frame.svg');
  expect(html).not.toMatch(/Johnny|First-person/);
});

it.each(slugs)('signs %s as the team, for readers and for search engines', (slug) => {
  const html = renderToStaticMarkup(<BlogArticlePage params={{ slug }} />);
  expect(html).toContain(`The ${TEAM}`);
  expect(html).toContain(`"name":"${TEAM}"`);
  expect(html).not.toMatch(/Johnny|\bI&#x27;m\b/);
  expect((generateMetadata({ params: { slug } }).openGraph as { authors?: string[] }).authors).toEqual([TEAM]);
});

/**
 * Lost and Found possible sightings metadata
 *
 * The page is a client component, so its title, description, canonical
 * address and social card are set here.
 *
 * @module app/lost-found/gallery/layout
 */

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Lost and Found possible sightings',
  description:
    'The frames Lost & Found saved in this browser when your camera saw colours like your lost pet\'s.',
  path: '/lost-found/gallery/',
});

export default function LostFoundMatchesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

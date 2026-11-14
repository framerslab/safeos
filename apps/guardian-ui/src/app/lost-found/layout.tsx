/**
 * Lost & Found metadata
 *
 * The page is a client component, so its title, description, canonical
 * address and social card are set here.
 *
 * @module app/lost-found/layout
 */

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Lost & Found',
  description:
    'Upload photos of your lost pet, and SafeOS Guardian checks your own camera for anything with the same colouring while the monitor stays open.',
  path: '/lost-found/',
});

export default function LostFoundLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

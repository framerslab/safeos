/**
 * Security metadata
 *
 * The page is a client component, so its title, description, canonical
 * address and social card are set here.
 *
 * @module app/security/layout
 */

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Security mode',
  description:
    'Security mode watches a room for movement, counts the people in view with COCO-SSD in your browser, and alerts you with a siren and a browser notification.',
  path: '/security/',
});

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

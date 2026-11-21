/**
 * Nap Mode metadata
 *
 * The page is a client component, so its title and its robots tag are set
 * here.
 *
 * @module app/nap/layout
 */

import type { Metadata } from 'next';
import { appPageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = appPageMetadata({
  name: 'Nap Mode',
  description: 'A watch while you rest, with a reminder when your planned time is up.',
  path: '/nap/',
});

export default function NapLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

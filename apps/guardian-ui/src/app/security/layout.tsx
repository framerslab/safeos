/**
 * People metadata
 *
 * The page is a client component, so its title, description, canonical
 * address and social card are set here.
 *
 * @module app/security/layout
 */

import type { Metadata } from 'next';
import { WAYS } from '@/lib/app-routes';
import { appPageMetadata } from '@/lib/page-metadata';

const way = WAYS.find((w) => w.id === 'security')!;

export const metadata: Metadata = appPageMetadata({
  name: way.name,
  description: way.line,
  path: way.href,
});

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

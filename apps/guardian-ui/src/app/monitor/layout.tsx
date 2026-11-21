/**
 * Motion and sound metadata
 *
 * The page is a client component, so its title and its robots tag are set
 * here.
 *
 * @module app/monitor/layout
 */

import type { Metadata } from 'next';
import { WAYS } from '@/lib/app-routes';
import { appPageMetadata } from '@/lib/page-metadata';

const way = WAYS.find((w) => w.id === 'monitor')!;

export const metadata: Metadata = appPageMetadata({
  name: way.name,
  description: way.line,
  path: way.href,
});

export default function MonitorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * History metadata
 *
 * The page is a client component, so its title and its robots tag are set
 * here.
 *
 * @module app/history/layout
 */

import type { Metadata } from 'next';
import { appPageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = appPageMetadata({
  name: 'History',
  description: 'Motion and sound alerts that run in your browser.',
  path: '/history/',
});

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

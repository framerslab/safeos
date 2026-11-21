/**
 * Dashboard metadata
 *
 * The page is a client component, so its title and its robots tag are set
 * here.
 *
 * @module app/dashboard/layout
 */

import type { Metadata } from 'next';
import { appPageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = appPageMetadata({
  name: 'Dashboard',
  description: 'Motion and sound alerts that run in your browser.',
  path: '/dashboard/',
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

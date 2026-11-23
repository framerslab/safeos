/**
 * Settings metadata
 *
 * The page and the pages under it are client components, so their title and
 * their robots tag are set here. Each page under it opens with the line that
 * says this browser is not keeping settings, shown only while that is so.
 *
 * @module app/settings/layout
 */

import type { Metadata } from 'next';
import { appPageMetadata } from '@/lib/page-metadata';
import { PageStorageLine } from '@/components/settings/PageStorageLine';

export const metadata: Metadata = appPageMetadata({
  name: 'Settings',
  description: 'Motion and sound alerts that run in your browser.',
  path: '/settings/',
});

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageStorageLine />
      {children}
    </>
  );
}

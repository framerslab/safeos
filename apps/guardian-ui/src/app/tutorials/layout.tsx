/**
 * Tutorials metadata
 *
 * The Tutorials page is a client component, so its title, description and
 * canonical address are set here.
 *
 * @module app/tutorials/layout
 */

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Tutorials and Guides',
  description:
    'Step-by-step guides for SafeOS Guardian: baby naps, pets, security, a lost pet, wildlife, your data, and the settings.',
  path: '/tutorials/',
});

export default function TutorialsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Tutorials metadata
 *
 * The Tutorials page is a client component, so its title, description and
 * canonical address are set here.
 *
 * @module app/tutorials/layout
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tutorials and Guides',
  description:
    'Step-by-step guides for SafeOS Guardian: baby naps, pets, security, a lost pet, wildlife, your data, and the settings.',
  alternates: { canonical: '/tutorials/' },
};

export default function TutorialsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

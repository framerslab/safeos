/**
 * Tutorial metadata
 *
 * The interactive tutorial is a client component, so its title, description
 * and canonical address are set here.
 *
 * @module app/tutorial/layout
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Interactive Tutorial',
  description:
    'Six short steps through SafeOS Guardian: the safety notice, choosing a profile, camera access, placing the camera, starting and answering alerts.',
  alternates: { canonical: '/tutorial/' },
};

export default function TutorialLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

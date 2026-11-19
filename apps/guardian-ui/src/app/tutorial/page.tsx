/**
 * Old tip walk address
 *
 * Getting started is in Help. This address forwards there.
 *
 * @module app/tutorial/page
 */

import type { Metadata } from 'next';
import { Forward } from '@/components/Forward';
import { appPageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = appPageMetadata({
  name: 'Help',
  description: 'Getting started is in Help.',
  path: '/help/',
});

export default function TutorialForward() {
  return <Forward to="/help/" line="Getting started is in Help." link="Open help" />;
}

/**
 * Old profiles address
 *
 * Watch settings are in Detection. This address forwards there.
 *
 * @module app/profiles/page
 */

import type { Metadata } from 'next';
import { Forward } from '@/components/Forward';
import { appPageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = appPageMetadata({
  name: 'Detection',
  description: 'Watch settings are in Detection.',
  path: '/settings/detection/',
});

export default function ProfilesForward() {
  return <Forward to="/settings/detection/" line="Watch settings are in Detection." link="Open Detection" />;
}

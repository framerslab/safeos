/**
 * Old analytics address
 *
 * Past alerts are in History. This address forwards there.
 *
 * @module app/analytics/page
 */

import type { Metadata } from 'next';
import { Forward } from '@/components/Forward';
import { appPageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = appPageMetadata({
  name: 'History',
  description: 'Past alerts are in History.',
  path: '/history/',
});

export default function AnalyticsForward() {
  return <Forward to="/history/" line="Past alerts are in History." link="Open history" />;
}

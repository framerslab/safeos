/**
 * Old support address
 *
 * safeos.sh asks for no money. This address forwards to About; for a browser
 * without script it says where the page went and links it. It is in neither
 * the sitemap nor the navigation, and asks search engines not to index it.
 *
 * @module app/donate/page
 */

import type { Metadata } from 'next';
import { Forward } from '@/components/Forward';
import { pageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'About SafeOS',
  description: 'Read about SafeOS.',
  path: '/about/',
  noIndex: true,
});

export default function OldSupportAddress() {
  return <Forward to="/about/" line="Read about SafeOS." link="Open About SafeOS" />;
}

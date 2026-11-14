/**
 * Wildlife metadata
 *
 * The page is a client component, so its title, description, canonical
 * address and social card are set here.
 *
 * @module app/wildlife/layout
 */

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Wildlife mode',
  description:
    'Wildlife mode watches a yard or a feeder with COCO-SSD in your browser and logs each animal it can name: dogs, cats, birds, horses, sheep, cows, bears, elephants, zebras and giraffes.',
  path: '/wildlife/',
});

export default function WildlifeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Setup metadata
 *
 * The page is a client component, so its title, description, canonical
 * address and social card are set here.
 *
 * @module app/setup/layout
 */

import type { Metadata } from 'next';
import { appPageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = appPageMetadata({
  name: 'Setup',
  description: 'Set up SafeOS on this device in two steps: turn on the camera, then say what it is watching.',
  path: '/setup/',
});

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

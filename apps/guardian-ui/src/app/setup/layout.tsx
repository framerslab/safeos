/**
 * Setup metadata
 *
 * The page is a client component, so its title, description, canonical
 * address and social card are set here.
 *
 * @module app/setup/layout
 */

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Setup',
  description:
    'Set up SafeOS Guardian in six steps: a welcome, the safety notice, what you are watching, camera and microphone access, notifications and a summary.',
  path: '/setup/',
});

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

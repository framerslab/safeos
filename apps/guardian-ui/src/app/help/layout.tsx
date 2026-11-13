/**
 * Help metadata
 *
 * The Help page is a client component, so its title, description and
 * canonical address are set here. The integration guides under /help keep the
 * metadata they set themselves.
 *
 * @module app/help/layout
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help',
  description:
    'Get started with SafeOS Guardian: setup steps, answers to common questions, keyboard shortcuts, troubleshooting and how to reach the team.',
  alternates: { canonical: '/help/' },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

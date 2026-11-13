/**
 * FAQ metadata
 *
 * The FAQ page is a client component, so its title, description and canonical
 * address are set here.
 *
 * @module app/faq/layout
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Answers about SafeOS Guardian: how setup works, what stays in your browser, what works offline, which browsers it needs, and who builds it.',
  alternates: { canonical: '/faq/' },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

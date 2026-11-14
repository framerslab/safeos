/**
 * Footer Component
 *
 * Industrial, utilitarian footer.
 * Consistent across all pages.
 *
 * @module components/layout/Footer
 */

import Link from 'next/link';
import { IconExternalLink, IconShield } from '../icons';

// =============================================================================
// Footer Links
// =============================================================================

interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

const footerSections: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/monitor', label: 'Monitor' },
      { href: '/history', label: 'History' },
      { href: '/settings', label: 'Settings' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/help', label: 'Help Center' },
      { href: '/faq', label: 'FAQ' },
      { href: '/blog', label: 'Blog' },
      { href: '/about', label: 'About' },
    ],
  },
  {
    title: 'Ecosystem',
    links: [
      { href: 'https://frame.dev', label: 'Frame (frame.dev)', external: true },
      { href: 'https://agentos.sh', label: 'AgentOS', external: true },
      { href: 'https://paracosm.agentos.sh', label: 'Paracosm', external: true },
      { href: 'https://github.com/framerslab/safeos', label: 'SafeOS on GitHub', external: true },
      { href: 'https://github.com/framerslab', label: 'framerslab on GitHub', external: true },
      { href: 'mailto:team@frame.dev', label: 'team@frame.dev', external: true },
    ],
  },
];

// =============================================================================
// Component
// =============================================================================

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[rgba(10,12,15,0.95)] border-t border-emerald-500/15 mt-auto">
      <div className="max-w-[1400px] mx-auto px-6 pt-12 pb-6">
        {/* Top Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-8 lg:gap-12">
          {/* Brand */}
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-4">
              <IconShield size={24} className="text-emerald-500" />
              <span className="font-[family-name:var(--font-space-grotesk)] text-lg font-semibold text-zinc-100">
                SafeOS Guardian
              </span>
            </div>
            <p className="text-sm leading-relaxed text-zinc-500 mb-4">
              Free motion and sound alerts in your browser, on a camera you already own.
              Local-first, privacy-preserving. Frame builds SafeOS and pays for its development.
            </p>
          </div>

          {/* Link Sections */}
          {footerSections.map((section) => (
            <div key={section.title} className="min-w-[120px]">
              <h3 className="font-[family-name:var(--font-space-grotesk)] text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">
                {section.title}
              </h3>
              <ul className="flex flex-col gap-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-100 transition-colors"
                      >
                        {link.label}
                        <IconExternalLink size={12} className="opacity-50" />
                      </a>
                    ) : (
                      <Link 
                        href={link.href} 
                        className="text-sm text-zinc-500 hover:text-zinc-100 transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mt-12 pt-6 border-t border-white/5">
          <span className="text-sm text-zinc-500">
            © {currentYear} Frame. SafeOS code is MIT-licensed.
          </span>
          <nav aria-label="Legal" className="flex items-center gap-2 text-sm">
            <Link
              href="/privacy"
              className="inline-flex items-center min-h-[44px] px-2 text-zinc-500 hover:text-zinc-100 transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="inline-flex items-center min-h-[44px] px-2 text-zinc-500 hover:text-zinc-100 transition-colors"
            >
              Terms
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

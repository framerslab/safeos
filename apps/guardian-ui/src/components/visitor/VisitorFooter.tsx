/**
 * Visitor footer
 *
 * The foot of every public page: the brand block, six small groups of links
 * (Privacy and Terms among them) and one last line with the copyright and the
 * code's licence. Every link opens in the same tab, so Back returns to the
 * page. It shows no status line: nothing checks one.
 *
 * @module components/visitor/VisitorFooter
 */

import Link from 'next/link';
import { SiteMark } from './SiteMark';
import { StartLink } from './StartLink';
import { Num } from './Num';

interface FooterLink {
  href: string;
  label: string;
  /** A link to another site or a mail address: a plain anchor. */
  outside?: boolean;
  /** A name that stays as it is in a translated page. */
  name?: boolean;
}

interface FooterGroup {
  title: string;
  links: FooterLink[];
}

// The first group, "Use it", holds the start link and is rendered apart.
export const FOOTER_GROUPS: FooterGroup[] = [
  {
    title: 'Uses',
    links: [
      { href: '/#baby-nap', label: 'A baby’s nap' },
      { href: '/#pet-out', label: 'A pet while you are out' },
      { href: '/#elderly-parent', label: 'An elderly parent' },
      { href: '/#lost-pet', label: 'A lost pet near home' },
      { href: '/#wildlife', label: 'Backyard wildlife' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/tutorials/', label: 'Guides' },
      { href: '/faq/', label: 'FAQ' },
      { href: '/help/', label: 'Help' },
      { href: '/blog/', label: 'Blog' },
    ],
  },
  {
    title: 'About',
    links: [
      { href: '/about/', label: 'About SafeOS' },
      { href: 'https://github.com/framerslab/safeos', label: 'SafeOS on GitHub', outside: true },
      { href: 'https://wilds.ai/discord', label: 'Discord', outside: true, name: true },
      { href: 'mailto:team@frame.dev', label: 'team@frame.dev', outside: true, name: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy/', label: 'Privacy' },
      { href: '/terms/', label: 'Terms' },
      { href: 'https://github.com/framerslab/safeos/blob/master/LICENSE', label: 'MIT License', outside: true },
      { href: 'https://github.com/framerslab/safeos/blob/master/SECURITY.md', label: 'Security policy', outside: true },
    ],
  },
  {
    title: 'From Frame',
    links: [
      { href: 'https://frame.dev', label: 'Frame', outside: true, name: true },
      { href: 'https://agentos.sh', label: 'AgentOS', outside: true, name: true },
      { href: 'https://paracosm.agentos.sh', label: 'Paracosm', outside: true, name: true },
    ],
  },
];

/** The year the site was built; the build sets it, and a test run falls back to today's. */
const BUILD_YEAR = process.env.NEXT_PUBLIC_BUILD_YEAR || String(new Date().getFullYear());

export function VisitorFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="tick-rule site-footer__rule" aria-hidden="true" />
        <div className="site-footer__brand">
          <SiteMark />
          <p className="site-footer__name" translate="no">
            SafeOS Guardian
          </p>
          <p className="site-footer__line">Motion and sound alerts that run in your browser.</p>
        </div>

        <nav aria-label="Site links" id="site-links" className="site-footer__groups" tabIndex={-1}>
          <div>
            <h2 className="site-footer__title">Use it</h2>
            <ul className="site-footer__list">
              <li>
                <StartLink className="site-footer__link" />
              </li>
            </ul>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <div key={group.title}>
              <h2 className="site-footer__title">{group.title}</h2>
              <ul className="site-footer__list">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.outside ? (
                      <a href={link.href} className="site-footer__link" translate={link.name ? 'no' : undefined}>
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="site-footer__link">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <p className="site-footer__last">
          © <Num>{BUILD_YEAR}</Num> <span translate="no">Frame</span>. <span translate="no">SafeOS</span> code is MIT-licensed.
        </p>
      </div>
    </footer>
  );
}

export default VisitorFooter;

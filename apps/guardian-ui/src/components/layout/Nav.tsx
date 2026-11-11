/**
 * Navigation Component
 *
 * Industrial, utilitarian top navigation bar.
 * Consistent across all pages.
 *
 * @module components/layout/Nav
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '../Logo';
import { NotificationDropdown } from '../NotificationDropdown';
import {
  IconHome,
  IconCamera,
  IconHistory,
  IconSettings,
  IconMenu,
  IconX,
  IconHelp,
  IconSun,
  IconMoon,
} from '../icons';
import { useTheme } from '../../lib/theme-manager';
import { useShortcutsHelp } from '../../lib/keyboard-shortcuts';

// =============================================================================
// Types
// =============================================================================

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

// =============================================================================
// Navigation Links
// =============================================================================

const navLinks: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', icon: IconHome },
  { href: '/monitor', label: 'Monitor', icon: IconCamera },
  { href: '/history', label: 'History', icon: IconHistory },
  { href: '/settings', label: 'Settings', icon: IconSettings },
];

// =============================================================================
// GitHub button
// =============================================================================

const GITHUB_REPO = 'framerslab/safeos';
const STAR_CACHE_KEY = 'safeos_github_stars';
const STAR_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function useGitHubStars(): number | null {
  const [stars, setStars] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STAR_CACHE_KEY);
      if (!raw) return null;
      const { count, fetchedAt } = JSON.parse(raw);
      if (Date.now() - fetchedAt > STAR_CACHE_TTL_MS) return null;
      return typeof count === 'number' ? count : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (stars !== null) return;
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const count = data?.stargazers_count;
        if (typeof count === 'number') {
          setStars(count);
          try {
            localStorage.setItem(STAR_CACHE_KEY, JSON.stringify({ count, fetchedAt: Date.now() }));
          } catch {
            /* localStorage may be unavailable in private mode */
          }
        }
      })
      .catch(() => {
        /* network or rate-limit failure — fall back to no count */
      });
    return () => controller.abort();
  }, [stars]);

  return stars;
}

function GitHubIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function StarIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

// =============================================================================
// Component
// =============================================================================

export function Nav() {
  const pathname = usePathname() || '';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const { toggle: toggleHelp } = useShortcutsHelp();
  const stars = useGitHubStars();

  // Prevent hydration mismatch by rendering placeholder during SSR
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] bg-[rgba(10,12,15,0.95)] backdrop-blur-xl border-b border-emerald-500/15">
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0">
          <Logo size="sm" showSuperCloud={false} />
        </Link>

        {/* Desktop Navigation */}
        <div className="nav-links-desktop">
          {navLinks.map((link) => {
            const isActive = mounted && (
              pathname === link.href ||
              (link.href !== '/' && pathname.startsWith(link.href))
            );
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
                  transition-all duration-150 font-[family-name:var(--font-space-grotesk)]
                  ${isActive
                    ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                  }
                `}
              >
                <Icon size={18} className="opacity-80" />
                <span>{link.label}</span>
              </Link>
            );
          })}

          {/* Separator */}
          <div className="w-px h-6 bg-white/10 mx-2" />

          {/* Resources Links - Desktop */}
          <Link
            href="/about"
            className={`
              px-3 py-2 rounded-md text-sm font-medium transition-all duration-150
              ${mounted && pathname === '/about'
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-zinc-500 hover:text-zinc-100 hover:bg-white/5'
              }
            `}
          >
            About
          </Link>
          <Link
            href="/faq"
            className={`
              px-3 py-2 rounded-md text-sm font-medium transition-all duration-150
              ${mounted && pathname === '/faq'
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-zinc-500 hover:text-zinc-100 hover:bg-white/5'
              }
            `}
          >
            FAQ
          </Link>
          <Link
            href="/blog"
            className={`
              px-3 py-2 rounded-md text-sm font-medium transition-all duration-150
              ${mounted && (pathname === '/blog' || pathname.startsWith('/blog/'))
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-zinc-500 hover:text-zinc-100 hover:bg-white/5'
              }
            `}
          >
            Blog
          </Link>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2">
          {/* GitHub repo + star count - Desktop */}
          <a
            href={`https://github.com/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View SafeOS on GitHub"
            className="hidden lg:inline-flex items-stretch h-9 rounded-md border border-white/10 hover:border-emerald-500/40 bg-white/[0.02] hover:bg-white/[0.05] overflow-hidden transition-colors group"
          >
            <span className="flex items-center gap-1.5 px-3 text-xs font-medium text-zinc-300 group-hover:text-white">
              <GitHubIcon size={16} className="text-zinc-300 group-hover:text-white" />
              GitHub
            </span>
            <span className="flex items-center gap-1 px-3 text-xs font-medium border-l border-white/10 text-zinc-300 group-hover:text-white group-hover:bg-emerald-500/10">
              <StarIcon size={12} className="text-amber-400" />
              {stars !== null ? formatStars(stars) : <span className="opacity-50">Star</span>}
            </span>
          </a>

          <div className="hidden lg:block w-px h-6 bg-white/10 mx-1" />

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-10 h-10 rounded-lg
                       text-zinc-400 hover:text-zinc-100 hover:bg-white/5
                       border border-transparent hover:border-white/10 transition-all"
            aria-label={
              mounted
                ? (isDark ? 'Switch to light mode' : 'Switch to dark mode')
                : 'Toggle theme'
            }
            title={
              mounted
                ? (isDark ? 'Switch to light mode' : 'Switch to dark mode')
                : 'Toggle theme'
            }
          >
            {(mounted ? isDark : true) ? <IconSun size={20} /> : <IconMoon size={20} />}
          </button>

          <NotificationDropdown />
          <button
            onClick={toggleHelp}
            className="flex items-center justify-center w-10 h-10 rounded-lg
                       text-zinc-400 hover:text-zinc-100 hover:bg-white/5
                       border border-transparent hover:border-white/10 transition-all"
            aria-label="Help"
            title="Keyboard Shortcuts (Press ?)"
          >
            <IconHelp size={20} />
          </button>

          {/* Mobile Menu Toggle */}
          <button
            className="nav-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <IconX size={24} /> : <IconMenu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="nav-mobile-menu">
          {navLinks.map((link) => {
            const isActive = mounted && (
              pathname === link.href ||
              (link.href !== '/' && pathname.startsWith(link.href))
            );
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  flex items-center gap-3 px-4 py-3.5 rounded-lg text-base font-medium
                  transition-all duration-150
                  ${isActive
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                  }
                `}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon size={20} className="opacity-80" />
                <span>{link.label}</span>
              </Link>
            );
          })}

          {/* Resources - Mobile */}
          <div className="border-t border-white/5 mt-3 pt-3">
            <span className="block px-4 py-2 text-xs text-zinc-500 uppercase tracking-wider font-medium">
              Resources
            </span>
            <Link
              href="/about"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-all"
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <span>About</span>
            </Link>
            <Link
              href="/faq"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-all"
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>FAQ</span>
            </Link>
            <Link
              href="/blog"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-all"
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
              <span>Blog</span>
            </Link>
          </div>

          {/* Theme Toggle - Mobile */}
          <div className="border-t border-white/5 mt-3 pt-3">
            <button
              onClick={() => {
                toggleTheme();
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-all w-full"
            >
              {isDark ? <IconSun size={20} className="text-amber-400" /> : <IconMoon size={20} className="text-indigo-400" />}
              <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>

          {/* GitHub repo + star count - Mobile */}
          <div className="border-t border-white/5 mt-3 pt-3">
            <a
              href={`https://github.com/${GITHUB_REPO}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/5 transition-all"
              onClick={() => setMobileMenuOpen(false)}
            >
              <GitHubIcon size={20} className="text-zinc-300" />
              <span className="flex flex-col flex-1">
                <span className="text-sm font-medium">View on GitHub</span>
                <span className="text-xs text-zinc-500">{GITHUB_REPO}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-xs text-zinc-300">
                <StarIcon size={12} className="text-amber-400" />
                {stars !== null ? formatStars(stars) : 'Star'}
              </span>
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

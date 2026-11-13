/**
 * Blog Index Page
 *
 * List of all blog posts from the Frame.dev team.
 *
 * @module app/blog/page
 */

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';
import Link from 'next/link';
import {
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconUser,
  IconFileText,
} from '../../components/icons';

export const metadata: Metadata = pageMetadata({
  title: 'Blog',
  description:
    'Updates, insights, and technical deep dives from the SafeOS Guardian team.',
  path: '/blog/',
});

// =============================================================================
// Types
// =============================================================================

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  readTime: string;
  tags: string[];
  image?: string;
}

// =============================================================================
// Data
// =============================================================================

const blogPosts: BlogPost[] = [
  {
    slug: 'how-safeos-guardian-works',
    title: 'How SafeOS Guardian works: motion-gated browser AI that doesn\'t burn your laptop',
    excerpt:
      'Walking through the safeos.sh pipeline file by file. 200 ms motion screening, COCO-SSD gated on motion, Lost & Found colour matching. TensorFlow.js running in a browser, by design.',
    date: 'January 10, 2026',
    author: 'Johnny Dunn',
    readTime: '8 min read',
    tags: ['technical', 'architecture', 'tensorflow.js', 'on-device-ai'],
  },
];

// =============================================================================
// Components
// =============================================================================

function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block p-6 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-emerald-500/50 transition-all duration-200"
    >
      <div className="flex flex-col h-full">
        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Title */}
        <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors">
          {post.title}
        </h3>

        {/* Excerpt */}
        <p className="text-slate-400 mb-4 flex-grow">{post.excerpt}</p>

        {/* Meta */}
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <IconClock size={14} />
            {post.date}
          </span>
          <span className="flex items-center gap-1">
            <IconUser size={14} />
            {post.author}
          </span>
          <span>{post.readTime}</span>
        </div>

        {/* Read More */}
        <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm font-medium group-hover:gap-3 transition-all">
          Read article
          <IconChevronRight size={16} />
        </div>
      </div>
    </Link>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-slate-400 hover:text-white"
              >
                <IconChevronLeft size={20} />
                <span className="hidden sm:inline">Back</span>
              </Link>
              <div className="flex items-center gap-2">
                <IconFileText size={22} className="text-emerald-400" />
                <h1 className="text-xl font-bold text-white">Blog</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            SafeOS Guardian Blog
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            First-person field notes on browser-based AI, on-device computer vision, and
            shipping monitoring tools that actually respect the user. By Johnny Dunn at{' '}
            <a
              href="https://frame.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300"
            >
              Frame
            </a>
            , the team also behind{' '}
            <a
              href="https://agentos.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300"
            >
              AgentOS
            </a>
            .
          </p>
        </div>

        {/* Posts Grid */}
        <div className="grid gap-6">
          {blogPosts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>

        {/* Subscribe CTA */}
        <section className="mt-16 text-center">
          <div className="p-8 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-2xl">
            <h3 className="text-xl font-semibold text-white mb-4">
              Stay Updated
            </h3>
            <p className="text-slate-400 mb-6">
              Follow us for the latest updates on SafeOS Guardian and other Frame.dev projects.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://github.com/framerslab/safeos"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
              >
                Star on GitHub
              </a>
              <a
                href="https://frame.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
              >
                Visit Frame.dev
              </a>
            </div>
          </div>
        </section>

        {/* Links */}
        <div className="mt-12 flex justify-center gap-4">
          <Link
            href="/about"
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
          >
            About SafeOS
          </Link>
          <Link
            href="/faq"
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
          >
            FAQ
          </Link>
        </div>
      </main>
    </div>
  );
}

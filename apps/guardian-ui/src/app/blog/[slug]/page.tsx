/**
 * Blog Article Page
 *
 * Individual blog post display.
 *
 * @module app/blog/[slug]/page
 */

import Link from 'next/link';
import { MakerMark } from '@/components/visitor/MakerMark';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';
import { MODEL_SIZE_MB } from '@/lib/detection-model-facts';
import {
  IconChevronLeft,
  IconClock,
  IconExternalLink,
} from '../../../components/icons';
import { NotAMedicalDevice } from '../../../components/NotAMedicalDevice';

// =============================================================================
// Types
// =============================================================================

interface BlogContent {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  readTime: string;
  tags: string[];
  content: React.ReactNode;
}

// =============================================================================
// Static Params for Export
// =============================================================================

export function generateStaticParams() {
  return [
    { slug: 'how-safeos-guardian-works' },
  ];
}

// =============================================================================
// Blog Content
// =============================================================================

const blogContent: Record<string, BlogContent> = {
  'how-safeos-guardian-works': {
    slug: 'how-safeos-guardian-works',
    title: 'How SafeOS Guardian checks for motion before it runs a model',
    description:
      'The browser compares camera frames every 200 ms and runs the detection model when something moves. This post goes through the code: the motion check, the model, the sound check and the Lost & Found matcher.',
    date: 'January 10, 2026',
    author: 'Frame.dev Team',
    readTime: '8 min read',
    tags: ['technical', 'architecture', 'tensorflow.js', 'on-device-ai'],
    content: (
      <>
        <p className="lead">
          SafeOS Guardian watches a room from the browser of a phone, tablet or laptop. It compares
          camera frames with plain arithmetic, and on the Security and Wildlife pages it runs an
          object-detection model when something moves. This post goes through the code that does it.
        </p>

        <h2>A check first, the model second</h2>

        <p>
          Every frame goes through a cheap check first. A frame goes on to the detection model when
          its motion level crosses the threshold, so the model stays idle while the room is still.
        </p>

        <p>
          The check is a <code>setInterval</code> loop that compares pixels every 200 ms, and a{' '}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Web Audio AnalyserNode
          </a>{' '}
          that reads the sound&apos;s frequencies every 100 ms. Both are arithmetic on the CPU, and
          neither loads a model. The intervals are constants in{' '}
          <a
            href="https://github.com/framerslab/safeos/blob/master/apps/guardian-ui/src/components/CameraFeed.tsx"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            <code>CameraFeed.tsx</code>
          </a>{' '}
          at lines 74&ndash;76:
        </p>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 my-6 font-mono text-sm overflow-x-auto">
          <div className="text-emerald-400">const FRAME_INTERVAL = 1000;<span className="text-slate-500">{' // gated frame capture'}</span></div>
          <div className="text-emerald-400">const MOTION_INTERVAL = 200;<span className="text-slate-500">{' // pixel-diff every 200ms'}</span></div>
          <div className="text-emerald-400">const AUDIO_INTERVAL = 100;<span className="text-slate-500">{' // FFT every 100ms'}</span></div>
        </div>

        <h2>The gate</h2>

        <p>
          Object detection waits for the check to report a change. The gate is in{' '}
          <a
            href="https://github.com/framerslab/safeos/blob/master/apps/guardian-ui/src/lib/person-detection.ts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            <code>person-detection.ts</code>
          </a>
          :
        </p>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 my-6 font-mono text-sm overflow-x-auto">
          <div className="text-slate-500">{`// lines 258-264: run detection when the motion level crosses its threshold`}</div>
          <div className="text-emerald-400">const motionTriggered = motionLevel &gt;= this.config.motionThreshold;</div>
          <div className="text-emerald-400">if (!motionTriggered) return null;</div>
        </div>

        <p>
          While nothing moves, the model does not run and the GPU stays in its low-power state.
          COCO-SSD&apos;s <code>model.detect()</code> runs only in Security and Wildlife, when
          something in the frame moved enough to cross the motion threshold, at most twice a second
          in Security (<code>minDetectionInterval: 500</code>). One exception: while Security is
          triggered or sounding an alert, it runs the model every five seconds whether or not
          anything moved, to see if the person is still there (<code>forceDetection</code>).
        </p>

        <h2>One model in the browser</h2>

        <p>
          Primary detector: a pre-trained{' '}
          <a
            href="https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            COCO-SSD
          </a>{' '}
          on SSDLite MobileNet V2, its 4.5 million weights stored as 32-bit floats, run via{' '}
          <a
            href="https://www.tensorflow.org/js"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            TensorFlow.js
          </a>
          . {MODEL_SIZE_MB} MB from Google model storage, downloaded only after you agree on the Security or
          Wildlife page, then kept in the browser&apos;s Cache Storage for offline use. It knows 80
          kinds of object; SafeOS uses its person class and ten animal classes. The detection
          canvas is 320&times;240 regardless of the source video resolution.
        </p>

        <p>
          For harder scenes, the optional SafeOS server you run yourself can send frames to a
          local{' '}
          <a
            href="https://ollama.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Ollama
          </a>{' '}
          install on the same network (moondream, llava:7b or llama3.2-vision), which describes the
          scene in words. If you also give that server your own OpenAI / Anthropic / Gemini key, it
          sends a frame to that provider when the local analysis is unavailable.
        </p>

        <h2>The sound check</h2>

        <p>
          The sound alert needs no model. The Web Audio API&apos;s{' '}
          <code>AnalyserNode</code> with <code>fftSize = 256</code> gives 128 frequency bins,
          sampled every ~100 ms. The alert goes off when the level stays above your threshold,
          whatever made the sound. A crying pattern (energy around the 300&ndash;600 Hz band, where
          a baby&apos;s cry has its fundamental) shows in the camera overlay, but it does not raise
          an alert on its own.
        </p>

        <NotAMedicalDevice />

        <h2>How Lost &amp; Found compares</h2>

        <p>
          The matcher uses no trained model. Each reference photo reduces to three
          signatures: a 32-bin color histogram, the top-5 dominant colors via k-means, and an 8&times;8
          grid of edge strengths taken from differences between neighbouring pixels. Together they
          take under 1 KB a photo. The matcher samples the live feed at 1&ndash;2 FPS, scores each
          frame on average colour first, then region by region on a weighted mix: histogram 40%,
          dominant colours 35%, edges 15%, size 10%. The code is in{' '}
          <a
            href="https://github.com/framerslab/safeos/blob/master/apps/guardian-ui/src/lib/visual-fingerprint.ts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            <code>visual-fingerprint.ts</code>
          </a>
          .
        </p>

        <p>
          It matches colours and a coarse outline, so it cannot tell your dog from another dog of the
          same colour. It needs no model download, and it costs little enough to run on every
          sample. The Lost &amp; Found loop is in{' '}
          <a
            href="https://github.com/framerslab/safeos/blob/master/apps/guardian-ui/src/app/monitor/page.tsx"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            <code>monitor/page.tsx</code>
          </a>{' '}
          around lines 258&ndash;271.
        </p>

        <h2>State and storage</h2>

        <p>
          State is{' '}
          <a
            href="https://github.com/pmndrs/zustand"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Zustand
          </a>
          : its persist middleware writes settings to localStorage, and saved frames and alerts go
          to IndexedDB. The interface is Next.js 14, React 18 and Tailwind. The files that do the
          watching are in <code>src/lib/</code>.
        </p>

        <h2>Known limits</h2>

        <p>
          On iOS, installing the app goes through Safari&apos;s Share menu, and listening in the
          background is limited. The detection model is an {MODEL_SIZE_MB} MB download, so on a slow
          connection the first Security or Wildlife start is slow.
          The Lost &amp; Found matcher compares colours, not identity, so another animal or an object
          of the same colour also matches. Most of these are tracked in{' '}
          <a
            href="https://github.com/framerslab/safeos/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            GitHub issues
          </a>
          .
        </p>

        <p>
          The motion gate keeps the model idle while nothing moves. Its code is in{' '}
          <a
            href="https://github.com/framerslab/safeos/blob/master/apps/guardian-ui/src/lib/person-detection.ts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            person-detection.ts
          </a>
          .
        </p>

        <p className="text-slate-500 italic">&mdash; The Frame.dev Team</p>
      </>
    ),
  },
};

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const post = blogContent[params.slug];

  if (!post) {
    return {
      title: 'Post Not Found',
      robots: { index: false, follow: false },
    };
  }

  return pageMetadata({
    title: post.title,
    description: post.description,
    keywords: post.tags,
    path: `/blog/${post.slug}/`,
    type: 'article',
    publishedTime: new Date(post.date).toISOString(),
    authors: [post.author],
  });
}

// =============================================================================
// Main Page
// =============================================================================

export default function BlogArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const post = blogContent[params.slug];

  if (!post) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Post Not Found</h1>
          <p className="text-slate-400 mb-8">
            The blog post you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/blog"
            className="key key--solid"
          >
            Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://safeos.sh').replace(/\/+$/, '');
  const articleUrl = `${siteUrl}/blog/${post.slug}/`;
  const publishedTime = new Date(post.date).toISOString();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.description,
            datePublished: publishedTime,
            dateModified: publishedTime,
            author: {
              '@type': 'Organization',
              name: post.author,
              url: 'https://frame.dev',
            },
            publisher: {
              '@type': 'Organization',
              name: 'Frame',
              url: 'https://frame.dev',
              logo: {
                '@type': 'ImageObject',
                url: `${siteUrl}/logos/frame-icon-light.svg`,
              },
            },
            mainEntityOfPage: {
              '@type': 'WebPage',
              '@id': articleUrl,
            },
          }),
        }}
      />
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/blog"
                className="flex items-center gap-2 text-slate-400 hover:text-white"
              >
                <IconChevronLeft size={20} />
                <span className="hidden sm:inline">All Posts</span>
              </Link>
            </div>
            <a
              href="https://frame.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"
            >
              Frame.dev
              <IconExternalLink size={14} />
            </a>
          </div>
        </div>
      </header>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <header className="mb-12">
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
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {post.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <IconClock size={14} />
              {post.date}
            </span>
            <span className="flex items-center gap-1">
              <MakerMark maker="frame" size={14} />
              {post.author}
            </span>
            <span>{post.readTime}</span>
          </div>
        </header>

        {/* Content */}
        <div className="prose prose-invert prose-emerald max-w-none [&_h2]:text-white [&_h2]:text-[1.5rem] [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-4 [&_p]:text-slate-300 [&_p]:leading-relaxed [&_p]:mb-4 [&_.lead]:text-lg [&_.lead]:text-slate-400 [&_ul]:text-slate-300 [&_ul]:mb-4 [&_ul]:pl-6 [&_ol]:text-slate-300 [&_ol]:mb-4 [&_ol]:pl-6 [&_li]:mb-2 [&_strong]:text-white [&_a]:text-emerald-400 [&_a:hover]:text-emerald-300">
          {post.content}
        </div>

        {/* Share / Author */}
        <footer className="mt-16 pt-8 border-t border-slate-700">
          <div className="flex items-center gap-4">
            <MakerMark maker="frame" size={40} />
            <div>
              <p className="font-medium text-white">Frame.dev Team</p>
              <p className="text-sm text-slate-400">
                Frame makes SafeOS and AgentOS.{' '}
                <a
                  href="https://frame.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  frame.dev
                </a>
              </p>
            </div>
          </div>
        </footer>

        {/* Navigation */}
        <nav className="mt-12 flex justify-center gap-4">
          <Link
            href="/blog"
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
          >
            All Posts
          </Link>
          <Link
            href="/about"
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
          >
            About SafeOS
          </Link>
        </nav>
      </article>
    </div>
  );
}

/**
 * Blog Article Page
 *
 * Individual blog post display.
 *
 * @module app/blog/[slug]/page
 */

import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import {
  IconChevronLeft,
  IconClock,
  IconUser,
  IconExternalLink,
} from '../../../components/icons';

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
    title: 'How SafeOS Guardian works: motion-gated browser AI that doesn\'t burn your laptop',
    description:
      'Walking through the safeos.sh pipeline file by file. 200ms screening, gated COCO-SSD + ViT inference, Lost & Found fingerprinting. TensorFlow.js + Transformers.js running in a browser, by design.',
    date: 'January 10, 2026',
    author: 'Johnny Dunn',
    readTime: '9 min read',
    tags: ['technical', 'architecture', 'tensorflow.js', 'transformers.js', 'on-device-ai'],
    content: (
      <>
        <p className="lead">
          A few years ago, running real-time computer vision in a browser was a thought experiment.
          You&apos;d see a demo at a conference, somebody&apos;d fire up a Codepen, the laptop fan
          would scream, and you&apos;d nod and move on. As of mid-2025, SafeOS Guardian ships exactly
          that &mdash; a Progressive Web App that runs COCO-SSD and ViT-base on a user&apos;s laptop
          or phone, no cloud round-trip &mdash; and the fan stays quiet. Here&apos;s how.
        </p>

        <h2>The two-tier pipeline</h2>

        <p>
          Every frame goes through a cheap screening layer. Only triggered frames go to the
          expensive deep-learning models. That single design choice &mdash; gating CV inference on
          motion + audio + pixel-change thresholds &mdash; is the difference between &quot;browser AI
          is theoretically possible&quot; and &quot;browser AI runs all night on a phone without
          melting the battery.&quot;
        </p>

        <p>
          Concretely: the screening layer is a <code>setInterval</code> loop at 200 ms running
          pixel-diff motion detection plus a{' '}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Web Audio AnalyserNode
          </a>{' '}
          FFT at 100 ms. Both are pure math on the CPU. No GPU context, no model loading, no
          service worker thrash. The intervals are constants in{' '}
          <a
            href="https://github.com/framerslab/safeos/blob/master/apps/guardian-ui/src/components/CameraFeed.tsx"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            <code>CameraFeed.tsx</code>
          </a>{' '}
          at lines 73&ndash;75:
        </p>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 my-6 font-mono text-sm overflow-x-auto">
          <div className="text-emerald-400">const FRAME_INTERVAL = 1000;<span className="text-slate-500"> // gated frame capture</span></div>
          <div className="text-emerald-400">const MOTION_INTERVAL = 200;<span className="text-slate-500"> // pixel-diff every 200ms</span></div>
          <div className="text-emerald-400">const AUDIO_INTERVAL = 100;<span className="text-slate-500"> // FFT every 100ms</span></div>
        </div>

        <h2>The gate</h2>

        <p>
          Object detection only runs when the screening layer says &quot;something happened.&quot; The
          gate is two lines in{' '}
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
          <div className="text-slate-500">{`// line 271-272: only run AI detection if motion was detected`}</div>
          <div className="text-emerald-400">if (!motionTriggered) return null;</div>
        </div>

        <p>
          No motion, no inference. The GPU stays in its low-power state. COCO-SSD&apos;s{' '}
          <code>model.detect()</code> only fires when something in the frame moved enough to cross
          the per-scenario threshold (configurable in settings &mdash; different thresholds for
          babies, pets, security). The pipeline can theoretically push 10&ndash;30 FPS through
          COCO-SSD on WebGL/WebGPU, but in practice it averages a fraction of a Hz because most
          frames don&apos;t pass the gate.
        </p>

        <h2>Two models, one fallback</h2>

        <p>
          Primary detector: a quantized{' '}
          <a
            href="https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            COCO-SSD
          </a>{' '}
          via{' '}
          <a
            href="https://www.tensorflow.org/js"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            TensorFlow.js
          </a>
          . ~5 MB on the wire, downloaded once on first model load, cached by the service worker
          forever after. Spots 80+ object classes with bounding boxes. The detection canvas is 320&times;240
          (model input size) regardless of the source video resolution.
        </p>

        <p>
          Tie-breaker: a quantized{' '}
          <a
            href="https://huggingface.co/Xenova/vit-base-patch16-224"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Xenova/vit-base-patch16-224
          </a>{' '}
          via{' '}
          <a
            href="https://huggingface.co/docs/transformers.js"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Transformers.js
          </a>
          . ~89 MB, downloaded on-demand only when COCO-SSD&apos;s top prediction is below the
          per-scenario confidence threshold. ViT-base is heavier but better at fine-grained scene
          labeling, useful for ambiguous frames (&quot;is this person standing or fallen?&quot;).
        </p>

        <p>
          For really hard scenes, you can configure an optional bridge to a local{' '}
          <a
            href="https://ollama.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Ollama
          </a>{' '}
          install on the same LAN &mdash; moondream, llava:7b, or llama3.2-vision &mdash; for richer
          scene reasoning. Nothing leaves your network. For when even Ollama isn&apos;t enough you
          can plug in your own OpenAI / Anthropic / Gemini keys; cloud fallback only fires on the
          frames the local models couldn&apos;t classify confidently.
        </p>

        <h2>Audio FFT, not an audio model</h2>

        <p>
          Cry detection, distress vocalizations, glass break, sustained silence &mdash; none of
          these need a model. The Web Audio API&apos;s{' '}
          <code>AnalyserNode</code> with <code>fftSize = 256</code> gives 128 frequency bins,
          sampled every ~100 ms. Threshold the right bins and you get most of what a small audio
          classifier would give you, at a fraction of the cost. Baby cries cluster in the
          300&ndash;600 Hz fundamental with characteristic harmonic patterns; glass breaks are
          mostly high-frequency transients; silence is the absence of energy across the spectrum.
        </p>

        <h2>Lost &amp; Found: 32 + 64 + 1 KB</h2>

        <p>
          The matcher doesn&apos;t use a deep model at all. Reference photos reduce to three
          signatures: a 32-bin color histogram, the top-5 dominant colors via k-means, and an 8&times;8
          Sobel-derived edge grid. Total: under 1 KB per reference photo. The matcher samples the
          live feed at 1&ndash;2 FPS and compares each candidate frame by cosine similarity. Code:{' '}
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
          Why this matters: a 32-bin histogram + an 8&times;8 edge grid generalizes well enough to
          match a dog at different angles and distances, without needing a face-embedding model
          you&apos;d have to keep updated. It&apos;s cheap, transparent, and runs at sample rate.
          The full Lost &amp; Found loop lives in{' '}
          <a
            href="https://github.com/framerslab/safeos/blob/master/apps/guardian-ui/src/app/monitor/page.tsx"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            <code>monitor/page.tsx</code>
          </a>{' '}
          around lines 242&ndash;254.
        </p>

        <h2>Same philosophy as AgentOS</h2>

        <p>
          SafeOS isn&apos;t the only thing{' '}
          <a
            href="https://frame.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Frame
          </a>{' '}
          ships under the &quot;local-first AI&quot; banner.{' '}
          <a
            href="https://agentos.sh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            AgentOS
          </a>{' '}
          is the agent runtime side &mdash; same idea, different domain. AgentOS&apos;s memory
          layer is{' '}
          <a
            href="https://docs.agentos.sh/features/cognitive-memory"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            grounded in cognitive science
          </a>{' '}
          instead of throwing a fixed-window context buffer at the LLM and hoping, and it{' '}
          <a
            href="https://agentos.sh/en/blog/agentos-memory-sota-longmemeval/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            scores 85.6% on LongMemEval-S
          </a>{' '}
          (+1.4 over Mastra) at under $0.009 per correct retrieval with GPT-4o. AgentOS&apos;s
          tool-forging is gated on a similar &quot;only when needed&quot; principle as SafeOS&apos;s
          CV inference:{' '}
          <a
            href="https://docs.agentos.sh/features/emergent-capabilities"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            agents create Zod-validated functions on demand
          </a>
          , then reuse them in a sandboxed V8 context. Same instinct: don&apos;t pay the cost until
          you need to.
        </p>

        <h2>The state management is boring</h2>

        <p>
          State is{' '}
          <a
            href="https://github.com/pmndrs/zustand"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Zustand
          </a>{' '}
          (lightweight, persist middleware writes to IndexedDB) and the UI is Next.js 14 + React 18
          + Tailwind. No magic. The interesting parts of the codebase are the pipeline files in{' '}
          <code>src/lib/</code>, not the React shell.
        </p>

        <h2>What&apos;s broken</h2>

        <p>
          PWA install on iOS is still rough &mdash; Safari&apos;s installation flow isn&apos;t
          great, and background audio capture has well-known limits. ViT-base&apos;s 89 MB download
          is real; on slow connections the first load is slow. Browser fingerprint matching
          isn&apos;t as good as a proper face-embedding model would be, but the trade-off is no
          model to keep updated and no PII leakage. Most of these are tracked in{' '}
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
          The honest version is: SafeOS is rough, occasionally inelegant, and runs on engineering
          decisions I&apos;m going to second-guess in six months. But it works, it&apos;s free,
          it&apos;s MIT-licensed, and it doesn&apos;t send your camera feed to a stranger&apos;s
          server. The most consequential of those decisions is the motion gate that keeps the GPU
          idle, and its code is in{' '}
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

        <p className="text-slate-500 italic">&mdash; Johnny Dunn, Frame</p>
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

  return {
    title: post.title,
    description: post.description,
    keywords: post.tags,
    alternates: {
      canonical: `/blog/${post.slug}/`,
    },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}/`,
      publishedTime: new Date(post.date).toISOString(),
      authors: [post.author],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
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
            className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
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
            },
            publisher: {
              '@type': 'Organization',
              name: 'Frame',
              url: 'https://frame.dev',
              logo: {
                '@type': 'ImageObject',
                url: `${siteUrl}/logos/frame.svg`,
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
              <IconUser size={14} />
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
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center">
              <Image
                src="/logos/frame.svg"
                alt="Frame.dev"
                width={32}
                height={32}
                className="invert"
              />
            </div>
            <div>
              <p className="font-medium text-white">Frame.dev Team</p>
              <p className="text-sm text-slate-400">
                Building tools for humanity.{' '}
                <a
                  href="https://frame.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  Learn more →
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

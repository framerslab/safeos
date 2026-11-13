/**
 * Ollama Integration Help
 *
 * How to run a local LLM (Ollama) for richer scene reasoning.
 *
 * @module app/help/integrations/ollama/page
 */

import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';
import { IconCpu, IconExternalLink } from '@/components/icons';

export const metadata: Metadata = pageMetadata({
  title: 'Ollama local LLM setup',
  description:
    'Run a local vision model with Ollama for richer SafeOS Guardian scene understanding.',
  path: '/help/integrations/ollama/',
});

export default function OllamaHelpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/help/integrations"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-4 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          All integrations
        </Link>

        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-300">
              <IconCpu size={20} />
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Ollama local LLM</h1>
          </div>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            In a processing mode that uses the server, the monitor sends camera frames to your API
            server, which analyses them with a local vision LLM via{' '}
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline inline-flex items-center gap-1"
            >
              Ollama
              <IconExternalLink size={12} />
            </a>
            . You provide the hardware. With no cloud AI key on the server, frames stay on your LAN.
            If you set <code>OPENROUTER_API_KEY</code>, <code>OPENAI_API_KEY</code> or{' '}
            <code>ANTHROPIC_API_KEY</code>, the server sends a frame to that provider when Ollama is
            down or its analysis fails.
          </p>
        </header>

        <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">Install Ollama</h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-3">
            macOS, Linux, or Windows — installers at{' '}
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline"
            >
              ollama.com/download
            </a>
            .
          </p>
          <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-x-auto text-slate-300">
{`# macOS / Linux
brew install ollama       # or use the installer
ollama serve              # starts on http://localhost:11434`}
          </pre>
        </section>

        <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">Pull a vision model</h2>
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Model</th>
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Size</th>
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Latency</th>
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Best for</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-slate-800">
                  <td className="py-2 px-2 font-mono">moondream</td>
                  <td className="py-2 px-2">~1.7 GB</td>
                  <td className="py-2 px-2">~500 ms</td>
                  <td className="py-2 px-2">Fast triage</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-2 px-2 font-mono">llava:7b</td>
                  <td className="py-2 px-2">~4 GB</td>
                  <td className="py-2 px-2">2–5 s</td>
                  <td className="py-2 px-2">Detailed analysis</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 font-mono">llama3.2-vision:11b</td>
                  <td className="py-2 px-2">~7 GB</td>
                  <td className="py-2 px-2">5–10 s</td>
                  <td className="py-2 px-2">Complex reasoning</td>
                </tr>
              </tbody>
            </table>
          </div>
          <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-x-auto text-slate-300">
{`ollama pull moondream
ollama pull llava:7b`}
          </pre>
        </section>

        <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">Wire to SafeOS</h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-3">
            Add the Ollama host URL to your API server&apos;s <code className="px-1 py-0.5 bg-slate-900 rounded">.env</code>:
          </p>
          <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-x-auto text-slate-300">
{`OLLAMA_HOST=http://localhost:11434`}
          </pre>
          <p className="text-xs text-slate-400 mt-2">
            If Ollama runs on a different machine on your LAN, use that machine&apos;s IP. Open
            port 11434 in its firewall.
          </p>
        </section>

        <section className="p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">Verify it works</h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-3">
            From the package root, run the bundled health check:
          </p>
          <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-x-auto text-slate-300">
{`pnpm ollama:check    # GETs http://localhost:11434/api/tags`}
          </pre>
          <p className="text-sm text-slate-300 leading-relaxed mt-3">
            Then pick a model under{' '}
            <Link href="/settings/models" className="text-emerald-300 underline-offset-2 hover:underline">
              Settings → AI Models
            </Link>
            . If it&apos;s detected, the dropdown will list the model name.
          </p>
        </section>
      </div>
    </div>
  );
}

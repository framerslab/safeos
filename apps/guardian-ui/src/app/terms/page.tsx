/**
 * Terms of Service Page
 *
 * Service disclaimers and usage guidelines.
 * Emphasizes free usage, no warranty, and lawful use.
 *
 * @module app/terms/page
 */

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';
import type { ReactNode } from 'react';
import { IconFileText, IconAlertTriangle, IconShield, IconHeart, IconCheck } from '@/components/icons';
import { SAFE_SLEEP_URL } from '@/components/NotAMedicalDevice';

export const metadata: Metadata = pageMetadata({
  title: 'Terms',
  description:
    'Terms of service and important usage disclaimers for SafeOS Guardian.',
  path: '/terms/',
});

// =============================================================================
// Terms Sections
// =============================================================================

interface TermSection {
  title: string;
  content: ReactNode;
}

const termsSections: TermSection[] = [
  {
    title: '1. Acceptance of Terms',
    content: (
      <p>
        By using SafeOS Guardian, you agree to these terms. If you don&apos;t agree, 
        please don&apos;t use the service. It&apos;s that simple.
      </p>
    ),
  },
  {
    title: '2. Service Description',
    content: (
      <div className="space-y-3">
        <p>
          SafeOS Guardian is a <strong>free, browser-based monitoring tool</strong> for 
          pets, babies, elderly care, lost & found, and home security. Monitoring runs in
          your browser; nothing is uploaded unless you connect a server you run yourself.
        </p>
        <p>
          Frame builds SafeOS and pays for its development. We provide this service at
          safeos.sh at no cost, with no premium tiers, and no hidden monetization.
        </p>
      </div>
    ),
  },
  {
    title: '3. Use at Your Own Risk',
    content: (
      <div className="space-y-3">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <p className="text-amber-300 font-medium flex items-center gap-2">
            <IconAlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
            This service is provided &quot;as is&quot; without warranty of any kind.
          </p>
        </div>
        <p>
          While we strive to make SafeOS Guardian reliable, technology can fail. 
          Motion detection might miss events. Alerts might not trigger. AI analysis 
          might be wrong.
        </p>
        <p className="font-medium text-white">
          Do NOT rely solely on this tool for safety-critical monitoring.
        </p>
      </div>
    ),
  },
  {
    title: '4. Not a Replacement for Supervision',
    content: (
      <div className="space-y-3">
        <p>
          SafeOS Guardian is designed to <strong>assist</strong>, not replace, 
          human supervision. Specifically:
        </p>
        <ul className="list-disc list-inside space-y-2 text-slate-400 ml-2">
          <li>
            <strong className="text-white">Baby monitoring:</strong> This does not 
            replace a caregiver. Babies require constant, attentive human supervision.{' '}
            SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS.{' '}
            <a
              href={SAFE_SLEEP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Safe-sleep guidance (NIH)
            </a>
          </li>
          <li>
            <strong className="text-white">Elderly care:</strong> This is not a 
            substitute for professional care services or regular check-ins.
          </li>
          <li>
            <strong className="text-white">Pet monitoring:</strong> Pets need 
            appropriate care, feeding, and attention beyond what any app can provide.
          </li>
          <li>
            <strong className="text-white">Security:</strong> Security mode adds an alert. It
            does not replace locks, an alarm service or emergency services.
          </li>
        </ul>
      </div>
    ),
  },
  {
    title: '5. No Warranty',
    content: (
      <div className="space-y-3">
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS 
          OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
          FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.
        </p>
        <p>
          IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, 
          DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR 
          OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE 
          USE OR OTHER DEALINGS IN THE SOFTWARE.
        </p>
      </div>
    ),
  },
  {
    title: '6. Free on safeos.sh',
    content: (
      <div className="space-y-3">
        <p>
          SafeOS at safeos.sh is <strong className="text-emerald-400">completely free</strong>. The
          code is MIT-licensed, so anyone can run it.
        </p>
        <ul className="space-y-2">
          {[
            'No subscription fees',
            'No premium features behind paywalls',
            'No ads or sponsored content',
            'No data monetization',
            'No &quot;free trial&quot; tricks',
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-slate-300">
              <IconCheck size={16} className="text-emerald-400 flex-shrink-0" />
              <span dangerouslySetInnerHTML={{ __html: item }} />
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    title: '7. Acceptable Use',
    content: (
      <div className="space-y-3">
        <p>You agree to use SafeOS Guardian only for lawful purposes. You may NOT:</p>
        <ul className="list-disc list-inside space-y-2 text-slate-400 ml-2">
          <li>Use it to monitor anyone without their consent where the law requires consent</li>
          <li>Use it for stalking, harassment, or invasion of privacy</li>
          <li>Use it to record others in violation of local laws</li>
          <li>Use it for any illegal surveillance activities</li>
          <li>Attempt to reverse-engineer for malicious purposes</li>
        </ul>
        <p className="text-sm text-slate-500">
          Note: Since your camera feed never reaches us, we have no way to enforce these rules
          technically. This is a moral and legal obligation you accept.
        </p>
      </div>
    ),
  },
  {
    title: '8. Privacy Monitoring Considerations',
    content: (
      <div className="space-y-3">
        <p>
          If you use SafeOS Guardian for monitoring, ensure you:
        </p>
        <ul className="list-disc list-inside space-y-2 text-slate-400 ml-2">
          <li>Have appropriate consent from monitored individuals (where applicable)</li>
          <li>Comply with local privacy and recording laws</li>
          <li>Post visible notices if recording in shared spaces</li>
          <li>Understand your jurisdiction&apos;s laws regarding home surveillance</li>
        </ul>
      </div>
    ),
  },
  {
    title: '9. Open Source License',
    content: (
      <p>
        SafeOS Guardian is open source software. You may view, modify, and 
        redistribute the code under the terms of our open source license. 
        See our GitHub repository for details.
      </p>
    ),
  },
  {
    title: '10. Changes to Terms',
    content: (
      <p>
        We may update these terms occasionally. We&apos;ll note the date of 
        last update at the bottom of this page. Continued use after changes 
        constitutes acceptance.
      </p>
    ),
  },
];

// =============================================================================
// Page Component
// =============================================================================

export default function TermsPage() {
  return (
    <main className="min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-6">
            <IconFileText size={32} className="text-blue-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white font-[family-name:var(--font-space-grotesk)] mb-4">
            Terms of Service
          </h1>
          <p className="text-lg text-slate-400">
            Plain-language terms for a free service.
          </p>
        </div>

        {/* Key Points Summary */}
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-6 mb-10">
          <h2 className="text-lg font-semibold text-blue-400 mb-3 font-[family-name:var(--font-space-grotesk)]">
            Key Points
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <IconHeart size={16} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Free on safeos.sh</p>
                <p className="text-xs text-slate-400">No account, no paid tier</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <IconAlertTriangle size={16} className="text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">No Warranty</p>
                <p className="text-xs text-slate-400">Use at your own risk</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <IconShield size={16} className="text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Use Responsibly</p>
                <p className="text-xs text-slate-400">Don&apos;t be creepy</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                <IconCheck size={16} className="text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Supplement Only</p>
                <p className="text-xs text-slate-400">Don&apos;t replace supervision</p>
              </div>
            </div>
          </div>
        </div>

        {/* Terms Sections */}
        <div className="space-y-8">
          {termsSections.map((section, i) => (
            <section
              key={i}
              className="pb-8 border-b border-white/5 last:border-0"
            >
              <h2 className="text-lg font-semibold text-white mb-4 font-[family-name:var(--font-space-grotesk)]">
                {section.title}
              </h2>
              <div className="text-slate-400 leading-relaxed">
                {section.content}
              </div>
            </section>
          ))}
        </div>

        {/* Contact */}
        <section className="mt-12 pt-8 border-t border-white/5">
          <h2 className="text-lg font-semibold text-white mb-4 font-[family-name:var(--font-space-grotesk)]">
            Questions?
          </h2>
          <p className="text-slate-400">
            If you have questions about these terms, contact us at{' '}
            <a
              href="mailto:legal@frame.dev"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              legal@frame.dev
            </a>
          </p>
        </section>

        {/* Last Updated */}
        <div className="text-center text-sm text-slate-500 mt-12">
          Last updated: November 2026
        </div>
      </div>
    </main>
  );
}




























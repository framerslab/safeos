/**
 * Home CTA (Client)
 *
 * Keeps the marketing homepage fully SSR/SSG while still allowing
 * personalized CTAs for returning users based on persisted onboarding state.
 *
 * @module components/home/HomeCTA
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useOnboardingStore, canSkipOnboarding } from '@/stores/onboarding-store';
import { IconShield, IconArrowRight } from '@/components/icons';

export function HomeCTA() {
  const onboardingState = useOnboardingStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isSetupComplete = useMemo(() => {
    if (!mounted) return false;
    return canSkipOnboarding(onboardingState);
  }, [mounted, onboardingState]);

  if (isSetupComplete) {
    return (
      <>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-4 px-10 py-5
                       bg-gradient-to-r from-emerald-600 to-emerald-500
                       hover:from-emerald-500 hover:to-emerald-400
                       text-white text-xl font-semibold rounded-xl
                       shadow-[0_0_40px_rgba(16,185,129,0.3)]
                       hover:shadow-[0_0_60px_rgba(16,185,129,0.5)]
                       transform hover:scale-[1.02] active:scale-[0.98]
                       transition-all duration-200
                       font-[family-name:var(--font-space-grotesk)]"
          >
            <IconShield size={28} />
            <span>Go to Dashboard</span>
            <IconArrowRight
              size={24}
              className="transform group-hover:translate-x-1 transition-transform"
            />
          </Link>
          <Link
            href="/setup"
            className="inline-flex items-center gap-2 px-6 py-3
                       text-slate-400 hover:text-emerald-400
                       transition-colors text-sm"
          >
            <span>Redo Setup</span>
          </Link>
        </div>
        <p className="mt-4 text-sm text-[var(--color-steel-500)]">
          Your monitoring dashboard awaits
        </p>
      </>
    );
  }

  return (
    <>
      <Link
        href="/setup"
        className="group inline-flex items-center gap-4 px-10 py-5
                   bg-gradient-to-r from-emerald-600 to-emerald-500
                   hover:from-emerald-500 hover:to-emerald-400
                   text-white text-xl font-semibold rounded-xl
                   shadow-[0_0_40px_rgba(16,185,129,0.3)]
                   hover:shadow-[0_0_60px_rgba(16,185,129,0.5)]
                   transform hover:scale-[1.02] active:scale-[0.98]
                   transition-all duration-200
                   font-[family-name:var(--font-space-grotesk)]"
      >
        <IconShield size={28} />
        <span>Start Setup</span>
        <IconArrowRight
          size={24}
          className="transform group-hover:translate-x-1 transition-transform"
        />
      </Link>
      <p className="mt-4 text-sm text-[var(--color-steel-500)]">
        Free · No account required
      </p>
    </>
  );
}


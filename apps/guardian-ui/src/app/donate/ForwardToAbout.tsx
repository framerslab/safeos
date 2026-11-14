'use client';

/**
 * Moves a visitor who opened the old support address on to About.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function ForwardToAbout() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/about/');
  }, [router]);

  return null;
}

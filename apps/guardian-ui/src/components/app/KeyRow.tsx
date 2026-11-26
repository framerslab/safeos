'use client';

import type { ReactNode } from 'react';
import { KeyRow as ScrollableKeyRow } from '../KeyRow';

export function KeyRow({ children }: { children: ReactNode }) {
  return <ScrollableKeyRow className="way-head__keys">{children}</ScrollableKeyRow>;
}

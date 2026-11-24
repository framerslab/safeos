'use client';

import Link from 'next/link';
import { WAYS, type WayId } from '@/lib/app-routes';
import { useSetupDone } from '@/lib/use-setup-done';

export function UseStartLink({ wayId, setupLabel }: { wayId: WayId; setupLabel: string }) {
  const setupDone = useSetupDone();
  const way = WAYS.find(({ id }) => id === wayId);
  if (!way) return null;

  return (
    <Link className="home-use__key" href={setupDone ? way.href : `/setup/?next=${way.id}`}>
      {setupDone ? `Open ${way.name}` : setupLabel}
    </Link>
  );
}

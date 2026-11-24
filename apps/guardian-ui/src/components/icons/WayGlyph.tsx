import { cloneElement } from 'react';
import type { WayId } from '@/lib/app-routes';
import { IconActivity, IconPaw, IconPerson, IconWildlife } from './index';

const GLYPHS: Record<WayId, (props: { size?: number }) => JSX.Element> = {
  monitor: IconActivity,
  'lost-found': IconPaw,
  security: IconPerson,
  wildlife: IconWildlife,
};

/** A way's glyph at 32 px, hidden from assistive technology: the words beside it name the way. */
export function WayGlyph({ way }: { way: WayId }) {
  return cloneElement(GLYPHS[way]({ size: 32 }), { 'aria-hidden': 'true', focusable: 'false' });
}

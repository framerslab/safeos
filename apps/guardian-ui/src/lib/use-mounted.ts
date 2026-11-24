/**
 * Whether the page has mounted in the browser
 *
 * A settings value is this device's own: the served page holds its place,
 * and the value shows once the page has mounted, never a default first.
 *
 * @module lib/use-mounted
 */

import { useEffect, useState } from 'react';

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

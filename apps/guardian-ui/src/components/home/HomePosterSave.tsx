'use client';

import { useEffect } from 'react';

type Connection = EventTarget & { effectiveType?: string; saveData?: boolean };

// Asks the service worker to save both looks' square posters on every visit
// that reaches the home page, whether it loads the page or follows a link
// inside the app. Save-Data, 2g, slow-2g and reduced motion defer the batch.
export function HomePosterSave() {
  useEffect(() => {
    const workers = navigator.serviceWorker;
    if (!workers) return undefined;
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.documentElement;
    const eligible = () => navigator.onLine && !motion.matches && !root.classList.contains('reduce-motion')
      && !(connection && (connection.saveData || /^(slow-)?2g$/.test(connection.effectiveType ?? '')));
    let active = true;
    const save = () => {
      if (!eligible()) return;
      workers.ready.then((registration) => {
        const worker = workers.controller || registration.active;
        if (active && worker && eligible()) worker.postMessage({ type: 'save-home-posters' });
      });
    };
    const observer = new MutationObserver(save);
    workers.addEventListener('controllerchange', save);
    window.addEventListener('online', save);
    motion.addEventListener('change', save);
    connection?.addEventListener('change', save);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(save); });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      workers.removeEventListener('controllerchange', save);
      window.removeEventListener('online', save);
      motion.removeEventListener('change', save);
      connection?.removeEventListener('change', save);
    };
  }, []);
  return null;
}

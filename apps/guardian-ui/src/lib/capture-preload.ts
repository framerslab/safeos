/**
 * The capture asked for early
 *
 * The first screen shows the capture for the width in the look that is on.
 * The root layout's script sets that look on the page before the first paint:
 * the visitor's choice from the look switch, or the device's look. This
 * script, which the home page carries before the capture, reads it and asks
 * for that one file early. With scripts off the page asks instead for the
 * device's own look in each crop's widths (CAPTURE_PRELOADS_SCRIPTS_OFF),
 * which is the look the page then shows.
 *
 * @module lib/capture-preload
 */

/** The widths each crop is shown at, as media queries. */
export const CAPTURE_CROP_MEDIA = {
  phone: '(max-width: 47.99em)',
  landscape: '(min-width: 48em) and (max-width: 63.99em), (min-width: 90em)',
  portrait: '(min-width: 64em) and (max-width: 89.99em)',
} as const;

export const CAPTURE_PRELOAD_SCRIPT = `(function(){try{var root=document.documentElement;var look=root.classList.contains('light')?'light':root.classList.contains('dark')?'dark':(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');var crop=window.matchMedia('(max-width: 47.99em)').matches?'phone':(window.matchMedia('(max-width: 63.99em)').matches||window.matchMedia('(min-width: 90em)').matches)?'landscape':'portrait';var link=document.createElement('link');link.setAttribute('rel','preload');link.setAttribute('as','image');link.setAttribute('type','image/webp');link.setAttribute('href','/home/capture-'+crop+'-'+look+'.webp');link.setAttribute('fetchpriority','high');document.head.appendChild(link)}catch(e){}})();`;

/** With scripts off: the device's own look for each crop's widths. */
export const CAPTURE_PRELOADS_SCRIPTS_OFF: { crop: keyof typeof CAPTURE_CROP_MEDIA; look: 'dark' | 'light'; media: string }[] = (
  ['dark', 'light'] as const
).flatMap((look) =>
  (Object.keys(CAPTURE_CROP_MEDIA) as (keyof typeof CAPTURE_CROP_MEDIA)[]).map((crop) => ({
    crop,
    look,
    media: CAPTURE_CROP_MEDIA[crop]
      .split(', ')
      .map((query) => `${query} and (prefers-color-scheme: ${look})`)
      .join(', '),
  }))
);

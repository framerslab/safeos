import { HOME_RUN_WIDE, mediaPath, type HomeRun, type RunSize } from './home-runs';

const sizes = ['square', 'wide'] as const;
const looks = ['dark', 'light'] as const;
const media = (size: RunSize) => size === 'wide' ? HOME_RUN_WIDE : '(width < 1280px)';

export function dashboardPreloads(dashboard: HomeRun) {
  return sizes.flatMap((size) => looks.map((look) => ({
    size, look, media: media(size) + ' and (prefers-color-scheme: ' + look + ')',
    href: mediaPath(dashboard.variants[size][look].poster.webp),
  })));
}

export function dashboardPreloadScript(dashboard: HomeRun) {
  const entries = dashboardPreloads(dashboard);
  const urls = JSON.stringify(Object.fromEntries(entries.map(({ size, look, href }) => [size + '-' + look, href])))
    .replace(/</g, '\\u003c');
  return "(function(){try{var root=document.documentElement;var look=root.classList.contains('light')?'light':"
    + "root.classList.contains('dark')||matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';"
    + "var offline=navigator.onLine===false;if(offline)root.dataset.homeOffline='true';"
    + "var size=!offline&&matchMedia(" + JSON.stringify(HOME_RUN_WIDE) + ").matches?'wide':'square';"
    + "var link=document.createElement('link');link.setAttribute('rel','preload');link.setAttribute('as','image');link.setAttribute('type','image/webp');"
    + "link.setAttribute('href'," + urls + "[size+'-'+look]);link.setAttribute('fetchpriority','high');document.head.appendChild(link);root.dataset.homePoster='true'}catch(e){}})();";
}

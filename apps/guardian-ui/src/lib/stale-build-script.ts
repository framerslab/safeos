/**
 * Before React starts
 *
 * A page whose own script or style files are gone never starts React, so the
 * app's error pages cannot help it: a deploy replaced the files while the page
 * was loading, or the browser kept the page's HTML from before a deploy. This
 * script runs first in the page's head. When one of the app's files fails to
 * load, it reloads the page once onto the newest build, by the same rule the
 * error pages follow (lib/recover-from-stale-build): once for each build within
 * five minutes, remembered in this tab's session storage, so a file missing for
 * another reason never reloads in a loop.
 *
 * @module lib/stale-build-script
 */

export const STALE_BUILD_RECOVERY = `(function () {
  var KEY = 'safeos-stale-build-reload';
  var WINDOW_MS = 300000;
  window.addEventListener('error', function (event) {
    var target = event.target;
    if (!target || (target.tagName !== 'SCRIPT' && target.tagName !== 'LINK')) return;
    var address = target.getAttribute('src') || target.getAttribute('href') || '';
    if (address.indexOf('/_next/static/') === -1) return;
    try {
      var runtime = document.querySelector('script[src*="/_next/static/chunks/webpack-"]');
      var build = runtime ? runtime.getAttribute('src') || '' : '';
      var saved = null;
      try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (unreadable) { saved = null; }
      var at = typeof saved === 'number' ? saved : saved && typeof saved.at === 'number' ? saved.at : 0;
      var last = saved && typeof saved.build === 'string' ? saved.build : '';
      var now = Date.now();
      if (now - at < WINDOW_MS && last === build) return;
      sessionStorage.setItem(KEY, JSON.stringify({ at: now, build: build }));
      location.reload();
    } catch (cannotRemember) {
      // A tab that cannot remember the reload does not reload, so it never loops.
    }
  }, true);
})();`;

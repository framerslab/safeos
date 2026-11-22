/**
 * The line for a page whose script did not start
 *
 * Served in the page's HTML, so it shows with scripts off. The script served
 * beside it proves scripts are on by running, so it hides the line at once;
 * if the app has not marked itself started five seconds later (its scripts
 * blocked or failing), the line shows again. An app that starts later hides
 * the line through CSS.
 *
 * @module lib/needs-script
 */

export const NEEDS_SCRIPT = 'SafeOS needs JavaScript to watch. Turn it on for safeos.sh, then reload this page.';

/** The inline script for the line with this id: it hides the line at once, and shows it again when the app has not started five seconds later. */
export function hideUntilNeeded(id: string): string {
  return `(function(){var line=document.getElementById('${id}');if(!line)return;var root=document.documentElement;line.hidden=true;setTimeout(function(){if(root.getAttribute('data-app-started')==='true')return;line.hidden=false},5000)})();`;
}

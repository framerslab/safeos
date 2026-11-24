/**
 * What a Lost and Found screen says, for the walks that hold its words.
 *
 * The comparison is of colours and coarse shape, so no screen of it says it
 * matched, detected, identified or recognised anything, gives a confidence or
 * calls itself accurate or likely.
 *
 * @module e2e/helpers/lost-found-words
 */

import type { Page } from '@playwright/test';

/** Words no Lost and Found screen shows, says or names. */
export const BARRED = /\bmatch(es|ed|ing)?\b|detected|confidence|accurate|likelihood|identif|recogni[sz]/i;

/**
 * The words a person meets in the scope: its visible text, joined with every
 * aria-label, alt, title and placeholder inside it, and the choices of every
 * list. With no scope, the page's main part (the app's content when the page
 * has no main element). Fails when the scope matches nothing, so an empty
 * read never passes for a clean one.
 */
export async function readWords(page: Page, scope?: string): Promise<string> {
  return page.evaluate((selector) => {
    const roots: HTMLElement[] = selector
      ? Array.from(document.querySelectorAll<HTMLElement>(selector))
      : [document.querySelector<HTMLElement>('main') ?? document.querySelector<HTMLElement>('#main-content')].filter(
          (root): root is HTMLElement => root !== null,
        );
    if (roots.length === 0) throw new Error(`Nothing on the page matches ${selector ?? 'main or #main-content'}`);
    const words: string[] = [];
    for (const root of roots) {
      words.push(root.innerText);
      for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
        for (const name of ['aria-label', 'alt', 'title', 'placeholder']) {
          const value = element.getAttribute(name);
          if (value) words.push(value);
        }
        if (element.tagName === 'OPTION' && element.textContent) words.push(element.textContent);
      }
    }
    return words.join('\n');
  }, scope ?? null);
}

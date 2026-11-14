/**
 * Reads served HTML as a document
 *
 * A component rendered with renderToStaticMarkup is the HTML a visitor's
 * browser gets before any script runs: no effect has run and no state has
 * changed. These helpers parse that HTML so a test can ask it what a visitor
 * reads.
 */

// jsdom ships no type declarations; the two members used here are declared.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom') as { JSDOM: new (html: string) => { window: { document: Document } } };

export function served(html: string): Document {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;
}

/**
 * An element's words as a reader takes them: a straight and a curly
 * apostrophe are one character, and so are a space and a non-breaking space.
 */
export function words(element: Element | null | undefined): string {
  return (element?.textContent || '')
    .replace(/\u2019/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** An address without its trailing slash: next/link drops it outside a build. */
export function bare(address: string | null | undefined): string {
  return (address || '').replace(/(?<=[^/])\/(?=$|[?#])/, '');
}

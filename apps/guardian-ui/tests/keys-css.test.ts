/** @jest-environment node */
/**
 * One set of keys
 *
 * src/styles/keys.css is read as text. It is the one stylesheet that sets a
 * key's box: 44 px tall at least with 6 px corners, in four kinds (solid,
 * outlined, text link, icon) with the same states. Every colour in it is a
 * token of the look. The visitor pages' stylesheet holds no rule for a key
 * and gives no control a corner of its own. A hovered link takes a 1 px
 * underline and the page being read keeps 2 px, and a pressed key sits 1 px
 * lower at full strength whatever the site's touch rules say.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', 'src');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  selectors: string[];
  declarations: Record<string, string>;
  /** The condition of the media block the rule stands in, or ''. */
  media: string;
}

/** A selector list split at its own commas, not at those inside :is() or :not(). */
function selectorsOf(list: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      selectors.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  selectors.push(current);
  return selectors.map((selector) => selector.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

/** Each rule of a stylesheet, the rules inside a media, supports or layer block included. */
function rulesOf(css: string): Rule[] {
  const rules: Rule[] = [];
  const walk = (block: string, media: string) => {
    let depth = 0;
    let start = 0;
    let head = '';
    for (let i = 0; i < block.length; i += 1) {
      const char = block[i];
      if (char === '{') {
        if (depth === 0) {
          head = block.slice(start, i).trim();
          start = i + 1;
        }
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const body = block.slice(start, i);
          if (/^@(media|supports|layer)\b/.test(head)) walk(body, head);
          else if (!head.startsWith('@')) {
            const declarations: Record<string, string> = {};
            for (const line of body.split(';')) {
              const colon = line.indexOf(':');
              if (colon > 0) declarations[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
            }
            rules.push({ selectors: selectorsOf(head), declarations, media });
          }
          start = i + 1;
        }
      }
    }
  };
  // Statements with no block (an import, a Tailwind directive) are no rules.
  walk(css.replace(/@(?:import|tailwind|charset)\b[^;{]*;/g, ''), '');
  return rules;
}

/** How many classes, attributes and pseudo-classes a selector names: the middle figure of its specificity. */
const classLevel = (selector: string) => (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\(|is\(|where\()[\w-]+/g) || []).length;

const STYLESHEETS = ['styles/design-system.css', 'styles/keys.css', 'styles/touch.css', 'styles/visitor.css', 'styles/watch-for.css', 'app/globals.css'];
const keys = rulesOf(read('styles/keys.css'));
const visitor = rulesOf(read('styles/visitor.css'));

/** The rules of a stylesheet that have this selector, outside any media block. */
const rule = (rules: Rule[], selector: string) => rules.filter((r) => r.media === '' && r.selectors.includes(selector));
/** A class named in a selector as a key: .key, .key--solid, .key__arrow; not .keyboard or .key-row. */
const NAMES_A_KEY = /\.key(?:--[\w-]+|__[\w-]+)?(?![\w-])/;

describe('the keys\' stylesheet', () => {
  it('is loaded directly after the design tokens, before every other stylesheet', () => {
    const imports = Array.from(read('app/globals.css').matchAll(/@import\s+'([^']+)'/g)).map((match) => match[1]);
    expect(imports.slice(0, 2)).toEqual(['../styles/design-system.css', '../styles/keys.css']);
  });

  it('sets the box every key shares: 44 px tall at least, the one corner, one line', () => {
    const [box, ...others] = rule(keys, '.key');
    expect(others).toHaveLength(0);
    expect(box.declarations['min-height']).toBe('44px');
    expect(box.declarations['border-radius']).toBe('var(--key-radius)');
    expect(box.declarations['white-space']).toBe('nowrap');
    // No key has a fixed height, so a key grows with its label.
    expect(box.declarations.height).toBeUndefined();
    expect(box.declarations['font-size']).toBe('var(--type-word-size)');
    expect(box.declarations['font-weight']).toBe('var(--weight-bold)');
  });

  it('gives every key a 6 px corner from one token, and no other corner', () => {
    expect(read('styles/design-system.css')).toMatch(/--key-radius:\s*0\.375rem;/);
    const corners = keys.filter((r) => 'border-radius' in r.declarations);
    expect(corners.length).toBeGreaterThanOrEqual(3);
    for (const r of corners) expect(`${r.selectors.join(', ')}: ${r.declarations['border-radius']}`).toBe(`${r.selectors.join(', ')}: var(--key-radius)`);
  });

  it('holds the four kinds and their states', () => {
    const selectors = keys.flatMap((r) => r.selectors);
    for (const kind of ['.key--solid', '.key--solid:hover', '.key--outline', '.key--outline:hover', '.key--word', '.key--word:hover', '.key--icon', '.key--icon:hover', '.link-row', '.link-row:hover', '.key--waiting']) {
      expect(selectors).toContain(kind);
    }
    // The look switch carries its own class and takes the icon key's box.
    const icon = keys.find((r) => r.selectors.includes('.key--icon') && r.selectors.includes('.look-switch'));
    expect([icon?.declarations.width, icon?.declarations.height]).toEqual(['44px', '44px']);
    // A shared start key is 52 px by default and 56 px in the wide layout or on home.
    expect(rule(keys, '.key--start')[0].declarations['min-height']).toBe('var(--start-key-height, 52px)');
    expect(rule(visitor, '.home-first').some((r) => r.declarations['--start-key-height'] === '56px')).toBe(true);
    expect(keys.find((r) => r.media.includes('90em') && r.selectors.includes('.key--start'))?.declarations['min-height']).toBe('56px');
    // An outlined key's label is the regular weight and its edge the line colour at rest.
    const outline = rule(keys, '.key--outline')[0].declarations;
    expect([outline.border, outline['font-weight']]).toEqual(['1px solid var(--color-steel-300)', 'var(--weight-regular)']);
    // An inactive key: no fill, a dashed edge, the quiet tone. Never dimness alone.
    const inactive = keys.find((r) => r.selectors.includes('.key--waiting') && r.selectors.includes(".key[aria-disabled='true']"))?.declarations;
    expect([inactive?.border, inactive?.background, inactive?.color]).toEqual(['1px dashed var(--color-steel-300)', 'transparent', 'var(--color-steel-200)']);
    expect(keys.some((r) => 'opacity' in r.declarations && r.declarations.opacity !== '1')).toBe(false);
  });

  it('takes every colour from a token of the look', () => {
    const colourProperties = /^(color|background|background-color|border|border-color|outline|outline-color|text-decoration-color|fill|stroke|box-shadow)$/;
    const values = keys.flatMap((r) => Object.entries(r.declarations).filter(([property]) => colourProperties.test(property)).map(([property, value]) => `${property}: ${value}`));
    expect(values.length).toBeGreaterThan(10);
    for (const value of values) {
      const colour = value
        .replace(/^[\w-]+:\s*/, '')
        .replace(/var\(--(?:color-steel-\d+|look-[\w-]+)\)/g, '')
        .replace(/\b(?:\d+px|solid|dashed|transparent|none|0)\b/g, '')
        .trim();
      expect(`${value} -> "${colour}"`).toBe(`${value} -> ""`);
    }
    expect(read('styles/keys.css')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('draws the ring on a focused key and keeps the key\'s corner under it', () => {
    const ring = keys.find((r) => r.selectors.some((s) => s.endsWith(':focus-visible')) && 'outline' in r.declarations);
    expect(ring?.declarations.outline).toBe('2px solid var(--look-accent)');
    expect(ring?.declarations['outline-offset']).toBe('2px');
    const corner = keys.find((r) => r.selectors.some((s) => s.endsWith(':focus-visible')) && 'border-radius' in r.declarations);
    expect(corner?.declarations['border-radius']).toBe('var(--key-radius)');
    // The visitor pages square a focused element's corners with two classes; this outranks it.
    for (const selector of corner?.selectors || []) expect(selector).toMatch(/^:root :is\(/);
  });

  it('sets a pressed key 1 px lower at full strength, and not at all under reduced motion', () => {
    const pressed = keys.filter((r) => r.selectors.some((s) => /^:root :is\(.*\):active$/.test(s)));
    const moving = pressed.find((r) => r.media === '');
    const still = pressed.find((r) => r.media.includes('prefers-reduced-motion: reduce'));
    expect(moving?.declarations).toEqual({ opacity: '1', transform: 'translateY(1px)' });
    expect(still?.declarations).toEqual({ transform: 'none' });
    // Every kind is named, the links told by their place among them.
    for (const kind of ['.key', '.key--icon', '.look-switch', '.link-row', '.site-header__link', '.site-menu__row', '.site-footer__link']) {
      expect(moving?.selectors[0]).toContain(kind);
      expect(still?.selectors[0]).toContain(kind);
    }
    // The site's touch rules shrink a pressed button and dim a pressed link
    // with two classes or pseudo-classes at most; :root, a class and :active
    // are three, so this rule outranks them wherever it is loaded.
    const touch = rulesOf(read('styles/touch.css')).filter((r) => r.selectors.some((s) => /(^|\s)(button|a):active/.test(s)));
    expect(touch.length).toBeGreaterThanOrEqual(3);
    for (const r of touch) for (const selector of r.selectors) expect([selector, classLevel(selector) < 3]).toEqual([selector, true]);
    expect(classLevel(':root .key:active')).toBe(3);
  });
});

describe('a row of keys', () => {
  it('starts its keys\' part at the first key, so a row that scrolls keeps its first key in reach', () => {
    const part = rule(keys, '.key-row__keys')[0]?.declarations;
    expect([part?.['justify-content'], part?.['flex-wrap'], part?.['overflow-x']]).toEqual(['flex-start', 'nowrap', 'auto']);
    // No browser is left to centre a row that scrolls, where the first key would sit before the scroll's start.
    expect(keys.filter((r) => r.selectors.includes('.key-row__keys')).map((r) => r.declarations['justify-content']).filter(Boolean)).toEqual(['flex-start']);
    expect(rule(keys, '.key-row')[0]?.declarations['justify-content']).toBe('center');
  });
});

describe('the other stylesheets', () => {
  it('leave the key\'s box to keys.css: no other stylesheet has a rule for .key itself', () => {
    for (const file of STYLESHEETS.filter((name) => name !== 'styles/keys.css')) {
      const own = rulesOf(read(file)).filter((r) => r.selectors.some((selector) => /^\.key(?:--(?:solid|start|outline|word|icon))?(?::[\w-]+)?$/.test(selector)));
      expect(`${file}: ${own.map((r) => r.selectors.join(', ')).join(' | ')}`).toBe(`${file}: `);
    }
  });

  it('the visitor pages\' stylesheet holds no rule for a key, the link row or the look switch\'s box', () => {
    const named = visitor.flatMap((r) => r.selectors).filter((selector) => NAMES_A_KEY.test(selector) || /\.look-switch(?![\w-])/.test(selector) || /^\.link-row\b/.test(selector));
    expect(named).toEqual([]);
    // The Menu key is the word key and the Menu's first row the solid key: neither has a box of its own here.
    const menuKey = visitor.filter((r) => r.selectors.some((selector) => /\.site-header__menu-key$/.test(selector)));
    for (const r of menuKey) expect(Object.keys(r.declarations)).toEqual(['display']);
    const start = rule(visitor, '.site-menu__start')[0].declarations;
    expect(Object.keys(start).sort()).toEqual(['display', 'margin-bottom', 'min-height']);
    expect(start['min-height']).toBe('48px');
  });

  it('the visitor pages\' stylesheet gives no control a corner of its own', () => {
    const corners = visitor.filter((r) => 'border-radius' in r.declarations).map((r) => `${r.selectors.join(', ')}: ${r.declarations['border-radius']}`);
    const allowed = /^(\.visitor-shell :focus-visible: 2px|\.skip-link: var\(--key-radius\)|\.visitor-shell \.skip-link:focus-visible: var\(--key-radius\))$/;
    expect(corners.filter((corner) => !allowed.test(corner) && /(4px|50%)$/.test(corner))).toEqual([]);
    expect(corners).toEqual(expect.arrayContaining(['.skip-link: var(--key-radius)']));
  });

  it('a hovered link takes a 1 px ink underline and the page being read keeps 2 px in the look\'s green', () => {
    for (const link of ['.site-header__link', '.site-menu__row']) {
      const hovered = visitor.find((r) => r.selectors.includes(`${link}:hover`) && !r.selectors.some((s) => s.includes('[aria-current]')))?.declarations;
      expect([link, hovered?.['text-decoration-thickness'], hovered?.['text-decoration-color']]).toEqual([link, '1px', 'var(--color-steel-50)']);
      const current = visitor.find((r) => r.selectors.includes(`${link}[aria-current]`))?.declarations;
      expect([link, current?.['text-decoration-thickness'], current?.['text-decoration-color']]).toEqual([link, '2px', 'var(--look-accent)']);
      // Under the pointer the page being read keeps its own underline.
      expect(visitor.find((r) => r.selectors.includes(`${link}[aria-current]`))?.selectors).toContain(`${link}[aria-current]:hover`);
    }
    const footer = visitor.find((r) => r.selectors.includes('.site-footer__link:hover'))?.declarations;
    expect(footer?.['text-decoration-thickness']).toBe('1px');
  });

  it('shows Privacy and GitHub in the row from 1024 px, and lets a short row give up GitHub first, then Privacy', () => {
    const wide = (r: Rule) => r.media.includes('min-width: 64em');
    expect(rule(visitor, '.site-header__link--wide')[0].declarations.display).toBe('none');
    expect(visitor.find((r) => wide(r) && r.selectors.includes('.site-header__link--wide'))?.declarations.display).toBe('inline-flex');
    expect(visitor.find((r) => wide(r) && r.selectors.includes(".site-header[data-short='privacy'] .site-header__link--wide"))?.declarations.display).toBe('none');
    // GitHub shows only in a row that is neither collapsed nor short.
    const github = visitor.filter((r) => r.selectors.some((s) => s.endsWith('.site-header__github')) && r.declarations.display === 'inline-flex');
    expect(github.map((r) => [r.media.includes('min-width: 64em'), r.selectors])).toEqual([[true, [".site-header:not([data-collapsed='true']):not([data-short]) .site-header__github"]]]);
  });

  it('leaves the text link its own underline: no page rule resets its colour or thickness', () => {
    // A text-decoration shorthand on a more specific rule puts the link back to
    // a thin underline in the text's colour, at rest and on hover.
    const resets = STYLESHEETS.filter((file) => file !== 'styles/keys.css')
      .flatMap((file) => rulesOf(read(file)).map((r) => ({ file, ...r })))
      .filter((r) => r.selectors.some((s) => /\.link-row(?![\w-])/.test(s)))
      .filter((r) => ['text-decoration', 'text-decoration-color', 'text-decoration-thickness'].some((name) => name in r.declarations))
      .map((r) => `${r.file}: ${r.selectors.join(', ')}`);
    expect(resets).toEqual([]);
  });
});

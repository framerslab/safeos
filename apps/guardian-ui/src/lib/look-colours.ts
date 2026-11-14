/**
 * The page colour of each look
 *
 * The browser's own bar takes the page colour of the look that is on: the
 * root layout declares these for a first visit, and the theme hook sets the
 * one in use after a press of the look switch. They are the steel-950 values
 * of design-system.css.
 *
 * @module lib/look-colours
 */

export const LOOK_PAGE_COLOURS = {
  dark: '#0b131b',
  light: '#f8f9fa',
} as const;

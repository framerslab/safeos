exports.barredWording = /\b(?:detect(?:s|ed|ing)?|identif(?:y|ies|ied|ying)|recogni[sz](?:e|es|ed|ing)|match(?:es|ed|ing)?|confidences?|intruders?|threats?|percent|per\s+cent|free forever|Cross Paths|humanitarian|donat(?:e|es|ed|ing|ions?))\b|%/i;

/** @param {Element} root */
exports.homeWordingInputs = function homeWordingInputs(root) {
  const content = /** @type {Element} */ (root.cloneNode(true));
  content.querySelectorAll('script, style, template').forEach((node) => node.remove());
  // A block ends a word, as it does on screen; inline elements stay joined.
  const blocks = 'address, article, aside, blockquote, br, dd, details, div, dl, dt, fieldset, figcaption, figure, footer, form, '
    + 'h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, summary, table, td, th, tr, ul';
  for (const block of content.querySelectorAll(blocks)) {
    block.before(' ');
    block.after(' ');
  }
  const texts = [content.textContent ?? ''];
  for (const node of content.querySelectorAll('[aria-label], [aria-description], [alt], [title]')) {
    for (const attribute of ['aria-label', 'aria-description', 'alt', 'title']) {
      const value = node.getAttribute(attribute);
      if (value) texts.push(value);
    }
  }
  return texts.map((text) => text.replace(/\s+/g, ' ').trim());
};

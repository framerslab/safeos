# Public page pictures

Captured in CI for pull request #21 by the
[Pictures run](https://github.com/framerslab/safeos/actions/runs/43500603961),
at 390 and 1280 pixels in the light and dark looks:

- Before: base commit `79320ffb5f7c4e8bcd5208bc9e4f1aa63dc0bc95` (master).
- After: commit `6d254b1498e135811868a0731439fe6db54b2ddb`.

`before/` and `after/` hold the same file names for the home page, About, FAQ,
Help, Tutorials, Tutorial, the blog and its post, the old support address
(`donate-*`, which now moves on to About), Privacy, Terms, Lost & Found, Setup,
Security and the not-found page (`404-html-*`). Each is a full page except
Privacy, which is the page body without the fixed header. The fixed header and
the phone tab bar can appear part-way down a full-page picture; that is the
capture, not the page.

Only `after/` has:

- `header-<width>-light.png`: the header row at 320, 360, 390, 430, 480, 768,
  820, 1024 and 1280 pixels, from the run's first-visit check, which passed:
  one row, every control on screen, no text under 13 px, 44 px targets below
  1280 px.
- `home-after-theme-button-390-<look>.png`: the home page after its theme
  button is pressed once, starting from each look.

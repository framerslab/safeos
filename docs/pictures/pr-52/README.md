# Pictures for pull request 52

Captured by the Pictures workflow (Playwright, Chromium, on the built static
site) and copied byte for byte from the artifacts of
[run 44862314188](https://github.com/framerslab/safeos/actions/runs/44862314188)
on commit c0ddd4c, where every walk passed.

`after/`: the `pictures` artifact, the pull request's own build. The run read
the repository's star count before the build and handed it over: 58, counted
21 November 2026.

Three files of `after/` are from a later run,
[run 44866334979](https://github.com/framerslab/safeos/actions/runs/44866334979)
on commit ac0df7f, which changed the keys at the foot of the FAQ, the blog and
a post: `faq-1280-light.png`, `blog-1280-light.png` and
`blog-how-safeos-guardian-works-1280-light.png`. That run read the same count
on the same day, and every walk passed.

`before/`: the `pictures-before` artifact, the base commit 7ffbaed, built and
captured by the same script. The base has no star count.

In both folders:

| File | What it shows |
|---|---|
| `site-header-<width>-<look>.png` | The public header on the home page at 390 and 1280 pixels. At 390 pixels the closed header is the same picture before and after: the brand, the look switch and Menu |
| `site-menu-390-<look>.png` | The Menu open on a phone |
| `site-footer-<width>-<look>.png` | The footer at 390 and 1280 pixels |
| `about-builders-<width>-<look>.png` | About's part on who builds SafeOS. Before, it is the part "Built by Frame.dev"; the page also told it a second time, under "Who Builds It" |
| `404-html-<width>-<look>.png` | The Not found page with its two keys |
| `setup-1280-dark.png` | Setup's welcome card, with Frame's name under the heading |
| `faq-1280-light.png` | The FAQ from top to bottom; its keys are at the foot of the page's own content: the solid key with the outlined key beside it, then two link rows |
| `blog-1280-light.png` | The blog from top to bottom: the mark in each byline, and at the foot the outlined key beside the solid key, then two link rows |
| `blog-how-safeos-guardian-works-1280-light.png` | A post from top to bottom: the mark in its byline and beside the team's name at its foot, then two link rows |

In `after/` alone, from the walk of the pull request's own build
(`apps/guardian-ui/scripts/home-checks.mjs` and
`apps/guardian-ui/scripts/public-chrome-checks.mjs`):

| File | What it shows |
|---|---|
| `keys-sheet-<look>.png` | The four kinds of key laid out on a public page with the site's own stylesheet. One row a kind: the solid key, the outlined key, a link told by its place, a link row, a word key, an icon key. From left to right: at rest, under the pointer, focused from the keyboard, pressed, and inactive (for the link told by its place, the page being read). Each tile is a picture of the live key in that form |
| `header-820-light.png`, `header-1024-light.png` | The row at a tablet (four links, no GitHub) and at 1024 pixels (Privacy as the fifth link, GitHub with its count) |
| `header-github-hover-1280-<look>.png` | The pointer over the GitHub link |
| `header-faq-hover-1280-<look>.png` | On the FAQ, the pointer over Guides: 1 pixel in the ink beside the 2 pixels in green under the page being read |

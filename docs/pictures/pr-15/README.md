# Settings and quiet-hours guidance pictures

Before and after captures of `/settings/` and `/settings/notifications/` at
390 and 1280 pixels, in light and dark looks, from the successful
[Pictures run](https://github.com/framerslab/safeos/actions/runs/43135270880).

- Before: `46a2158a39efc6b7908d1ba4d2cb0fefeed636a8` (pull request base).
- After: `42fac1dbdc5db7a2893475998deadb6317b66d9d` (wording and API changes).
- The `pictures-before` artifact supplies `before/`; `pictures` supplies `after/`.
- Each filename identifies the route, viewport width, and look. All captures
  are full-page PNGs from the workflow, without image editing.

The notification page now says high and critical alerts bypass quiet hours.
Settings links to that dedicated page, so its overview remains visually unchanged;
the matching copy in its inactive inline notification section is corrected too.

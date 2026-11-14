# Dashboard and header menu pictures

Captured in CI for pull request #25 by the
[Pictures run](https://github.com/framerslab/safeos/actions/runs/43570858829):

- Before: master at `25e230cd54ad5cb33503eae1986d0e4bc8e9e6e7`, from the run's
  "Capture before pictures" job.
- After: commit `c78a511ff31995038e467e89cf65573b82531996`, from the run's
  "Capture pictures" job.

`before/` and `after/` hold the same file names:

- `dashboard-setup-<width>-<look>.png`: the dashboard as a person who has
  finished setup sees it, at 390 and 1280 pixels in the light and dark looks.
  Full pages; on a phone the fixed tab bar can appear part-way down the
  picture, which is the capture, not the page.
- `dashboard-menu-390-<look>.png`: the dashboard's header menu open at 390
  pixels, the screen as it shows.

Only `after/` has `dashboard-menu-check-<width>-light.png`: the header menu
open on the dashboard at 320, 360, 390, 430, 480 and 768 pixels, from the run's
mode-link check, which passed: the header row is one row with none of Lost &
Found, Security and Wildlife in it, and the open menu lists all three under
Dashboard, Monitor, History and Settings.

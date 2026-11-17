# Nap Mode pictures

Captured in CI for pull request #34 by the Pictures workflow,
[run 44169700727](https://github.com/framerslab/safeos/actions/runs/44169700727).
`before/` and `after/` hold the same file names.

- `nap-<width>-<look>.png`: the Nap Mode page (`/nap/`) as it first opens, full
  page, at 390 and 1280 pixels wide, light and dark.
  - Before: the pull request's base, master at `3829fdb`, from the run's
    "Capture before pictures" job. The page ends with "Planned nap duration:
    30 minutes", a slider from 15 to 90 minutes and "We'll remind you when your
    planned nap time is up".
  - After: this branch at `7d8095c`, from the run's "Capture pictures" job. The
    duration and its reminder are gone; the rest of the page is the same.

What Start Nap Mode does after the check is shown by the walk
`apps/guardian-ui/e2e/nap-opens-the-watch.spec.ts`, which ends on the monitor
with the Nap preset saved.

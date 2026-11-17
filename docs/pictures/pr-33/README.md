# Alert card and Cooldown Period pictures

Captured in CI for pull request #33. `before/` and `after/` hold the same file
names, except `low-motion-alerts.png`, which only `after/` has.

- `critical-motion-alerts.png`: the Monitor page's alert list, 1280 pixels
  wide, light look, while the walk's test camera changes the whole picture
  (a critical motion reading of 75 % on a 20 % line).
  - Before: the walk at `d2ef75f4a9c2f0e1a5fab7b9b206c639fc94f760`, which
    holds the old monitor code, in
    [CI run 44013993175](https://github.com/framerslab/safeos/actions/runs/44013993175):
    the failure picture of the critical case, taken when the walk stopped
    waiting for a second alert, 16 s after the first. One card, no repeat.
    Cropped to the alert list.
  - After: the walk at `699e1ac0f07e2469bf23a0deed2d2d7cef285a89` in
    [CI run 44152894178](https://github.com/framerslab/safeos/actions/runs/44152894178),
    after the second alert at the 10 s Cooldown Period: the same card says
    "Repeated 1 time".
- `low-motion-alerts.png` (after only): the same run's low case, a reading of
  25 % on the 20 % line, after the second alert at the 20 s Cooldown Period.
- `escalation-timing-1280-<look>.png`: the Timing Settings card of Alert
  Escalation (`/settings/escalation/`), 1280 pixels wide, light and dark,
  cropped from full-page captures. Before: master at
  `0134678`, [Pictures run 44153956649](https://github.com/framerslab/safeos/actions/runs/44153956649).
  After: `699e1ac0f07e2469bf23a0deed2d2d7cef285a89`,
  [Pictures run 44153964351](https://github.com/framerslab/safeos/actions/runs/44153964351).
  The Cooldown Period's hint changes from "Time between repeated alerts for
  the same event" to "Shortest time between repeated alerts for one event; a
  rise in severity alerts sooner".

The Monitor page's Alert Cooldown slider has the same new hint. It sits in a
settings section that starts closed, and no capture opens it.

# Pictures for pull request 42

`acknowledged-in-another-tab.png`: the monitor's alert list in CI's alert walk
(`apps/guardian-ui/e2e/alerts-repeat.spec.ts`, the case "a card acknowledged in
another tab stays acknowledged"), Chromium, saved by the walk at its own size and
copied byte for byte from the `alert-walk-report` artifact of
[CI run 44343190385](https://github.com/framerslab/safeos/actions/runs/44343190385).
A second tab acknowledged the event's card; the event's next alert went on a new
card, which the alert after it updated ("Repeated 1 time"), and the acknowledged
card stays under "1 acknowledged alert".

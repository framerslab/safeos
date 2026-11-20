# Pictures for pull request 48

Saved by the browser walks of the CI job "Web app Lost & Found browser test"
(Playwright, Chromium, on the built static site) and copied byte for byte from
their artifacts. A file keeps the name its walk gave it; a screenshot
Playwright saved when a walk failed (`test-failed-1.png`) is renamed after the
picture its walk takes once it passes.

`after/`: the `settings-pictures` and `nap-pictures` artifacts of
[CI run 44532334311](https://github.com/framerslab/safeos/actions/runs/44532334311)
on commit 373fb9b, where every walk passed. The two `pitch-range-*` pictures are
the widened range walk's, from the `settings-pictures` artifact of
[CI run 44806854547](https://github.com/framerslab/safeos/actions/runs/44806854547)
on commit 15fcadd, where every walk passed: a range of up to 128 bins reads its
own bins there.

`before/`: the walks' red runs, on the tests before their fixes.

| File | Run and head | Walk and file in the `lost-found-browser-test` artifact |
|---|---|---|
| `pitch-range-1000hz-300-3000-1280.png`, `pitch-range-1000hz-20-20000-1280.png` | [44462450908](https://github.com/framerslab/safeos/actions/runs/44462450908), bd38ed0 | sound-pitch-range, the widened range at a sensitivity of 90 (the walk runs at 85 since; the level it shows is the red) |
| `setup-last-step-1280.png` | [44462450908](https://github.com/framerslab/safeos/actions/runs/44462450908), bd38ed0 | setup-lost-found, `test-failed-1.png` |
| `watch-for-cleared-in-another-tab-1280.png` | [44525805913](https://github.com/framerslab/safeos/actions/runs/44525805913), 4fdce7b | watch-for, Clear All Local Data in another tab, `test-failed-1.png` |
| `watch-for-pet-on-picture-1280.png` | [44525805913](https://github.com/framerslab/safeos/actions/runs/44525805913), 4fdce7b | watch-for, the pet on the camera's picture, `test-failed-1.png` |
| `watch-for-pet-changed-1280.png` | [44525805913](https://github.com/framerslab/safeos/actions/runs/44525805913), 4fdce7b | watch-for-pet-change, `test-failed-1.png` |
| `watch-for-photo-kept-390.png` | [44525805913](https://github.com/framerslab/safeos/actions/runs/44525805913), 4fdce7b | watch-for, a photo added before another pet is chosen, `test-failed-1.png` |
| `watch-for-long-name-320.png` | [44525805913](https://github.com/framerslab/safeos/actions/runs/44525805913), 4fdce7b | watch-for, a long pet name at 320 px, `test-failed-1.png` |

The set-time pictures in `after/` have no before: the failing walks'
screenshots show the top of the page, above the line that changed.

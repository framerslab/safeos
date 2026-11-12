# Export page pictures

Captured by the [Pictures workflow](https://github.com/framerslab/safeos/actions/runs/43227511414)
for pull request #18 at 390 and 1280 pixels, in the light and dark looks.

- Before: base commit `ff72798ce405ea598b76c1771056312067d63828`.
- After: implementation commit `d7c4d96d1cde26a836f6bfd572692cacf8c9b754`.

Both builds use the same signed-in fixture and export-page capture script.
The before pictures show the previous option descriptions; the after pictures
state the record limits for alerts, analysis results and stream history.
The initial-page pictures show the option descriptions. The capture script also
downloads a profile fixture with both omission counts to show the notice in both
builds. The export-page tests cover either, both and no omitted settings in both
export endpoints. Only export-page images from workflow artifacts are included here.

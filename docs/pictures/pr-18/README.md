# Export page pictures

Captured in CI for pull request #18 at 390 and 1280 pixels, in the light and dark looks.

Initial-page pictures (`export-*.png`, excluding `export-notice-*`) come from the
[initial Pictures run](https://github.com/framerslab/safeos/actions/runs/43227511414):

- Before: base commit `ff72798ce405ea598b76c1771056312067d63828`.
- After: implementation commit `d7c4d96d1cde26a836f6bfd572692cacf8c9b754`.

Download-notice pictures (`export-notice-*.png`) come from the
[notice Pictures run](https://github.com/framerslab/safeos/actions/runs/43231243984):

- Before: base commit `ff72798ce405ea598b76c1771056312067d63828`.
- After: capture commit `769f1f555bff4e010fc2b934815a8afe97033b2c`.

Both versions use the same signed-in fixture and capture script from the head
of their run. The initial-page pictures compare the option descriptions and
record limits. The notice pictures download a profile fixture with two monitoring
settings omissions and one notification settings omission. Before shows the
monitoring notice; after shows both notices. The export-page tests also cover
either, both and no omitted settings for both export endpoints.

Only export-page images from the workflow artifacts are included here.

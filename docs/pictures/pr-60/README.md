# Pictures for pull request 60

[Pictures run 45432734805](https://github.com/framerslab/safeos/actions/runs/45432734805)
captured the built site at commit `e53e5d8da6e5ce7841a48bd9cd0d936a86e355f5` and
its base, `c8aa399a8e8dcbc59109217519ebab83f41a6e41`. The route pictures are
copied from its `pictures` artifact into `after/` and its `pictures-before`
artifact into `before/`.

The four browser stops use Chromium’s striped camera and a pet named Stripes.
Their `after/` pictures come from the `settings-pictures` artifact of
[CI run 45432735096](https://github.com/framerslab/safeos/actions/runs/45432735096),
on the same head commit. Their `before/` pictures come from the `pictures-before`
artifact of
[Pictures run 45381408102](https://github.com/framerslab/safeos/actions/runs/45381408102),
which walked the same stops on the base of that time,
`facee47899cd31fe064295445894b8afcab589cb`. That base predates the alert
pictures on the watch, so the before watch and full-screen pictures show no
alert entry. Every PNG is copied as captured.

| File | What it shows |
|---|---|
| `lost-found-<width>-<look>.png` | Lost and Found at 390 and 1280 pixels in both looks |
| `lost-found-gallery-<width>-<look>.png` | The gallery at 390, 820, 1280 and 1920 pixels in both looks |
| `monitor-lost-found-pet-<width>-<look>.png` | The Watch with a saved pet at all four widths in both looks |
| `lost-found-setup-words-1280.png` | Setup’s alert step with the full-screen pictures switched on |
| `lost-found-watch-words-1280.png` | The Watch comparing the live picture with Stripes’s photo |
| `lost-found-overlay-words-1280.png` | The full-screen alert |
| `lost-found-gallery-words-1280.png` | A saved picture opened in the gallery |

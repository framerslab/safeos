# Browser models and offline starts

Security and Wildlife use one COCO-SSD `lite_mobilenet_v2` model. Models settings
offers the same download. Opening these pages does not grant download agreement:
finish setup, then choose **Download detection model**. The first download is
about 19 MB from Google model storage. Camera frames are not sent with it.

The loader shares an in-progress request and a ready model between detectors.
A failed load clears the pending promise, so **Retry model download** or a route
return can try again. Agreement is retained locally. TensorFlow reads its manifest
and each weight shard through a cache-backed IO handler. Each successful response
is saved before it is returned. If the browser has no Cache Storage or will not
store a file (a private window, a full quota), the model still loads from the
network and the page says it could not be saved, so the next start needs a
connection. No monitoring page downloads the unused Transformers.js classifier.

Security's **Arm system** button stays disabled until the model is ready, so the
page never shows an armed system that checks no frame. Wildlife's **Start**
button works the same way.

Offline starts require two completed preparations:

1. The service worker installs the exported HTML and all generated scripts,
   styles, fonts and route data. The postbuild script derives the list and cache
   version from the actual output. Installation fails if an asset cannot be saved.
2. For person or animal detection, the agreed model download must finish. The
   model cache is separate from app caches and survives app updates.

A worker serves one build consistently. A newer worker waits for tabs using the
previous worker to close before activating and deleting the old app cache.
Model and unrelated caches are preserved. Browser storage can be cleared or
evicted; reconnect to restore missing app files or model weights. Server
integrations require a connection even when the app and model are saved.

## Implementation and validation

The change adds rendered-page regressions for consent, retry, the Models download
control, and persistent detection weights. Browser APIs and GPU execution are
replaced at their edges; TensorFlow's manifest and weight IO runs in the tests.
Worker install, activation and fetch handlers run against a fake Cache Storage.
CI also builds the static export and opens Wildlife offline in Chromium, then
operates its settings control. All validation runs in CI.

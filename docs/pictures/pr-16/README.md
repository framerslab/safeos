# Export page pictures

Before and after Export content at 390 and 1280 pixels wide, in light and dark
looks. Both builds use the same signed-in session fixture and capture script.
The capture includes the Export page content; fixed navigation is hidden during
capture so it does not cover the content in the full-height image.

Before source: `022a7f40042de15591ef41fc6ca94b17ba318569`.
After source: `166335c2f054a77c2a736b80d899da75b281de76`.
[Pictures run](https://github.com/framerslab/safeos/actions/runs/43140797061).

## Privacy and saved-history update notices

Before and after Privacy content and Monitor's two database update notices, each
at 390 and 1280 pixels wide, in light and dark looks. These captures frame the app
content and hide fixed navigation so it does not cover the text.

- `privacy-*`: the storage policy, tab-update guidance and policy date.
- `monitor-updated-*`: another connection requests a newer database version.
- `monitor-blocked-*`: an older connection remains open while the page opens its database.

The capture uses real IndexedDB connections. Before pictures show the earlier
screen without reload guidance; after pictures show the notice and reload button.
CI checks both notices' text and a minimum 4.5:1 text contrast in both looks.

Before source: `022a7f40042de15591ef41fc6ca94b17ba318569`.
After source: `976ebfb19225b5bf8152c1c73fcb57326c36e94e`.
[Pictures run](https://github.com/framerslab/safeos/actions/runs/43152345499).

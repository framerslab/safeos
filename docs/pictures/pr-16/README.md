# Saved alert history pictures

## Saved history for the whole browser: the current pictures

The `history-before` and `history-after` pictures are the current set. They show
the Privacy page and Monitor under each of the three reload notices, at 390 and
1280 px in the light and dark looks. These captures frame the app content and
hide fixed navigation so it does not cover the text.

- `privacy-*`: who sees saved alerts, the limits, what a clear and a sign-out
  reach, the tab-update guidance and the policy date.
- `monitor-blocked-*`: an older connection stays open while the page opens its database.
- `monitor-updated-*`: another connection asks for a newer database version.
- `monitor-failed-*`: an upgrade of saved history that cannot finish.

The capture uses real IndexedDB connections, and both versions use the capture
script of the after commit. The before version has none of the three notices:
its Monitor pictures show the same screens without one, and its
`monitor-failed-*` pictures list the alert the scenario saved beforehand, since
that version has no upgrade to fail. In the after pictures CI checks each
notice's words and a minimum 4.5:1 text contrast in both looks.

Before source: `334f74e433db7a9ea6513e09b7454956a01b85e0`.
After source: `c4f70263b54a79b2aede41ea3fd9e49834bddaa9`.
[Pictures run](https://github.com/framerslab/safeos/actions/runs/43379574464).

The Monitor and Privacy pictures in `before`, `after`, `session-before`,
`session-after` and `privacy-after`, described in the sections below, show
superseded words: saved alerts no longer belong to a person, the notices say
what is paused until the reload, and a third notice covers an upgrade that
cannot finish. They stay as the record of the earlier wording.

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

## Session and database availability

The `session-before` pictures show Privacy and both Monitor reload notices at
390 and 1280 px in the light and dark looks, captured from
`3551ee905939bed74c169d0127a806ff47ea5981` before the session changes.
The picture run is https://github.com/framerslab/safeos/actions/runs/43158706583.
The follow-up captures show the session-renewal explanation and the notice that
alerts received in a tab awaiting reload are not saved.

After source: `270c626b46ade54b166743f863eab78e2a853440`.
[Session and database-notice pictures](https://github.com/framerslab/safeos/actions/runs/43160155758).
The `session-after` files contain all twelve captures. Both notices pass the
wording and 4.5:1 text-contrast checks at both widths and in both looks.

## Browser and server storage wording

The `privacy-after` pictures replace the earlier Privacy captures as the final
after view. They show the complete retention, session-renewal, blocked-storage
and browser-versus-server clearing guidance at 390 and 1280 px in both looks.
Compare with `session-before/privacy-*` for the before view. The earlier
`session-after` captures remain as the intermediate wording and the final Monitor notices.

Final Privacy source: `c9fe1ab7588394b9b6bd452ac849f40c361d5661`.
[Privacy picture run](https://github.com/framerslab/safeos/actions/runs/43161989850).

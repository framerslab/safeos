# Saved alert history pictures

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

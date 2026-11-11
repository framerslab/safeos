# PR 12 pictures

Full-page captures at 390 and 1280 pixels wide in light and dark looks.
The fixed mobile navigation appears at the bottom of the original viewport.

- Home, Settings, Notification Settings and AI Models before images: master
  `5398b55d801ea9743dc553239eb9e24fa74cfa5c`,
  [run 43011298314](https://github.com/framerslab/safeos/actions/runs/43011298314).
- Monitor, Nap, Dashboard, Admin, Privacy and FAQ before images: master
  `02be03848d0f5c8a77bbe26d75464f7ca8c56a9f`,
  [run 43061333808](https://github.com/framerslab/safeos/actions/runs/43061333808).
  These supplement routes absent from the earlier artifact and include the
  camera lifecycle changes already merged into master.
- All after images: `3d30ea44c8a97c03a3f3427e26aeeb89461c84a2`,
  [run 43061333808](https://github.com/framerslab/safeos/actions/runs/43061333808).

The route-only job cannot open Settings' Privacy tab, Backend Settings, the
account menu, expanded dashboard model details or expanded FAQ answers. It also
cannot demonstrate the nap camera test, active monitoring, notification delivery
or clicks, a connected model server, or an authenticated admin review queue.
The pictures show the initial route states; the PR records these limitations.

# SafeOS Guardian home pictures

The files are the original PNGs from the [Pictures run](https://github.com/framerslab/safeos/actions/runs/45313527300).
The first screens use 390 × 844 and 1440 × 900 CSS viewports at 2× with a fresh browser in each look.

- `before/` comes from the `pictures-before` artifact at base `6674c8698dec8e029a417f939cdaa76a88f12d34`.
- `after/` comes from the `pictures` artifact at head `c520bf6fa0aee23a3c8c5b45e4ff56d46db3d421`.

The use-card image shows the earlier Wildlife glyph. The current card and model disclosure use a bird.

| Image | View | SHA-256 |
| --- | --- | --- |
| [`before/home-first-390-dark.png`](before/home-first-390-dark.png) | Phone, dark look | `b7af1d25f11e91079950972329419b00c204615db690ab847a0e4ccf458dc46a` |
| [`before/home-first-390-light.png`](before/home-first-390-light.png) | Phone, light look | `2a8a3d0fe1e356a06a3f98780eb999ed3b087753d1a686dc24c46f0d4bf60200` |
| [`before/home-first-1440-dark.png`](before/home-first-1440-dark.png) | Desktop, dark look | `148a97d05ab4e3a8c6cba31edb56bbaaeb3fe636083a7bc454be6d0e3396f7bb` |
| [`before/home-first-1440-light.png`](before/home-first-1440-light.png) | Desktop, light look | `8e81ee737ef37b5d51b08faaa853d14adcea581aeda98c6b6b747359173be03e` |
| [`after/home-first-390-dark.png`](after/home-first-390-dark.png) | Phone, dark look | `29cc795da29ae2b3640db39b5057492201055e604f224cadda4ebceca65cb175` |
| [`after/home-first-390-light.png`](after/home-first-390-light.png) | Phone, light look | `b54f7622eb2b30a9f094182da8f39a93564075771e9930094be07c861f44dc84` |
| [`after/home-first-1440-dark.png`](after/home-first-1440-dark.png) | Desktop, dark look | `4ef114561052297b874b782960ea3388bd9b459d7c81f317222645a47b012dc9` |
| [`after/home-first-1440-light.png`](after/home-first-1440-light.png) | Desktop, light look | `2633d900182df527840f7317ea2059d8b75ab3ee2571a96bb707728f4124de1d` |
| [`after/home-how-it-works-1440-dark.png`](after/home-how-it-works-1440-dark.png) | Desktop diagram with the inputs, checks and server band | `192ca29ebb078518ffab5440431f564c3c5a8f9af3c09612ff54c4a57b0a3080` |
| [`after/home-how-it-works-390-light.png`](after/home-how-it-works-390-light.png) | Phone diagram with the stages stacked | `d7ce857ceabe8c0a7632b9fc005df15259dbc2cdb8b41d2a1fb7f30f00deb10f` |
| [`after/home-lost-and-found-1440-dark.png`](after/home-lost-and-found-1440-dark.png) | The open Lost and Found explanation | `7bc8cccfd5024351a267763845ad3842999f974983250f04258d8851cbcc8b88` |
| [`after/home-device-1440-dark.png`](after/home-device-1440-dark.png) | One-device setup, its QR code and the server options | `25246d5007b4420f55a91f1f6dfe9a30994207ec48a27ecdaa62665015dfb617` |
| [`after/home-uses-1440-dark.png`](after/home-uses-1440-dark.png) | The five uses with their original Wildlife glyph | `8121259f379b12f8d0d066d63dc2595d3cb84c979858ed0c9e5565ee1a498e73` |
| [`after/home-closing-1440-dark.png`](after/home-closing-1440-dark.png) | The closing setup link | `ef203d0195f661bc2e24cf75a7e65a396f6aaa8b588e45a71aaf9de9f585f32a` |

## Readability

The after job measured 4,798 ranges with zero findings in the home walk and pixel report. The `pictures` artifact contains `home-readability.json` with the ranges and their measurements.

| View | Body contrast and size | Label contrast and size | Glyph contrast | Edge contrast |
| --- | --- | --- | --- | --- |
| 390 px, light | 15.72:1, 18 px | 8.64:1, 16 px | 8.19:1 | 7.35:1 |
| 390 px, dark | 16.47:1, 18 px | 10.08:1, 16 px | 9.97:1 | 6.92:1 |
| 1440 px, light | 16.80:1, 20 px | 8.64:1, 16 px | 8.19:1 | 7.35:1 |
| 1440 px, dark | 17.05:1, 20 px | 10.08:1, 16 px | 9.97:1 | 6.92:1 |

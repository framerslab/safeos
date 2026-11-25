# SafeOS Guardian home recordings and pictures

The original PNGs come from the [Pictures run](https://github.com/framerslab/safeos/actions/runs/45558776118). The first-screen captures use fresh browsers at 390 × 844 and 1440 × 900 CSS pixels, at 2× in both looks.

- `before/` comes from `pictures-before` at base `0e21dda1420742cebd5b8db0444512d37b0c3322`.
- `after/` comes from `pictures` for head `f2d6b971f8a88363ef7861ec4e9b2149fed705d5`.
- The recordings and the refreshed app stills come from the [producer run](https://github.com/framerslab/safeos/actions/runs/45551367763) at `1fbe1325916c4733374cdd4141672ad4e7e33c7e`.

| Image | View | SHA-256 |
| --- | --- | --- |
| [`before/home-first-390-dark.png`](before/home-first-390-dark.png) | Phone first screen, dark look | `3ca0ca6c8778e988118db2182a4b24e32be3759a79b841209dd2fd739d474a19` |
| [`before/home-first-390-light.png`](before/home-first-390-light.png) | Phone first screen, light look | `1d57576de5703e88a8d66ee5fbfb785698e3bef5c2d1c52926238a08a694d4ce` |
| [`before/home-first-1440-dark.png`](before/home-first-1440-dark.png) | Desktop first screen, dark look | `2c964ae392f9222e8f8945b50e07d9845fc0457f3b38a7a0393847b3b78ef9f8` |
| [`before/home-first-1440-light.png`](before/home-first-1440-light.png) | Desktop first screen, light look | `d1564370788eaf5119b36352f579f60b92bfc27f25098fc1cf969eae3ecf1249` |
| [`after/home-first-390-dark.png`](after/home-first-390-dark.png) | Phone first screen, dark look, Watching poster | `5717615f2e6a11aa859e9259f0b18d60d2aec9de5f9b7df4560e54cd3488832a` |
| [`after/home-first-390-light.png`](after/home-first-390-light.png) | Phone first screen, light look, Watching poster | `3c64f64102955278aa3ff3e49188c4d97bca5640a49a7f80446e5eb013188aac` |
| [`after/home-first-1440-dark.png`](after/home-first-1440-dark.png) | Desktop first screen, dark look, Watching poster | `90068d5132287ec06d8f200be2f6427fdc87bd4a1c9e13163a38781c20c70b50` |
| [`after/home-first-1440-light.png`](after/home-first-1440-light.png) | Desktop first screen, light look, Watching poster | `5bca67a8db4269cfa686b145f9732bafbafdb37bb6c9eaac062b03b0e89e78e4` |
| [`after/home-dashboard-390-dark.png`](after/home-dashboard-390-dark.png) | Phone Dashboard poster with both saved alerts, dark look | `6f116d234d042cf40e4822004dc622ed33876dc9ffe1afdd7ab8564e38eb02b1` |
| [`after/home-dashboard-390-light.png`](after/home-dashboard-390-light.png) | Phone Dashboard poster with both saved alerts, light look | `1b6e1fb6a42f8fd7e8cac54332036aac3f395b13c7ef3f2a6ba5b7acef8f6b48` |
| [`after/home-dashboard-1440-dark.png`](after/home-dashboard-1440-dark.png) | Desktop Dashboard poster with both saved alerts, dark look | `d4623c48a3b622c1a6ea461b06f28f7419f1d17aa1a27a1d038130636c6f88b9` |
| [`after/home-dashboard-1440-light.png`](after/home-dashboard-1440-light.png) | Desktop Dashboard poster with both saved alerts, light look | `001ba21f081cf3295ffe36e4f7a139fc335e5e55ba969208943e61c30518e903` |
| [`after/home-watching-1440-dark.png`](after/home-watching-1440-dark.png) | Desktop Watching poster at the bark, dark look | `8e7ff417c59f309a2eddeeefda15157da2b2c21906990b2e4964806111334298` |
| [`after/home-watching-playing-1440-dark.png`](after/home-watching-playing-1440-dark.png) | Desktop Watching in playback, dark look | `a47fbfa0810f5950826cee236a9fa32ea6fe77e9c6d789531fc1f9bb975aef65` |
| [`after/home-dashboard-playing-1440-dark.png`](after/home-dashboard-playing-1440-dark.png) | Desktop Dashboard in playback, dark look | `f7bdbf3f6c61b886c4a9266cc693c9e9672db07c64db68599b52d913d00cb81c` |

## Readability

The after job measured 6,436 ranges across 66 images with 0 findings. The 692 recorded word boxes measured at least 8.58:1 contrast. The smallest projected font was 14.27 px, and every word passed the raster height check with one device pixel allowed at each edge.

The `pictures` artifact includes `home-readability.json` with each sampled range and `home-first-bounds.json` with the controls and caption measurements.

| Width | Look | Controls end | Watching caption | Dashboard caption | Settings caption |
| ---: | --- | ---: | ---: | ---: | ---: |
| 320 px | light | 777.45 px | 2 lines, 825.45 px | 2 lines, 825.45 px | 2 lines, 825.45 px |
| 320 px | dark | 777.45 px | 2 lines, 825.45 px | 2 lines, 825.45 px | 2 lines, 825.45 px |
| 390 px | light | 785.56 px | 2 lines, 833.56 px | 2 lines, 833.56 px | 2 lines, 833.56 px |
| 390 px | dark | 785.56 px | 2 lines, 833.56 px | 2 lines, 833.56 px | 2 lines, 833.56 px |
| 1280 px | light | 585.25 px | 1 line, 609.25 px | 1 line, 609.25 px | 1 line, 609.25 px |
| 1280 px | dark | 585.25 px | 1 line, 609.25 px | 1 line, 609.25 px | 1 line, 609.25 px |
| 1440 px | light | 610.25 px | 1 line, 634.25 px | 1 line, 634.25 px | 1 line, 634.25 px |
| 1440 px | dark | 610.25 px | 1 line, 634.25 px | 1 line, 634.25 px | 1 line, 634.25 px |
| 1920 px | light | 666.50 px | 1 line, 690.50 px | 1 line, 690.50 px | 1 line, 690.50 px |
| 1920 px | dark | 666.50 px | 1 line, 690.50 px | 1 line, 690.50 px | 1 line, 690.50 px |

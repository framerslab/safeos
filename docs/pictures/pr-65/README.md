# SafeOS Guardian home recordings and pictures

The PNGs come from the [Pictures run](https://github.com/framerslab/safeos/actions/runs/45682887959). The first-screen captures use fresh browsers at 390 × 844 and 1440 × 900 CSS pixels, at 2× in both looks.

- `before/` comes from `pictures-before` at base `0e21dda1420742cebd5b8db0444512d37b0c3322`.
- `after/` comes from `pictures` for head `be675f7ebf86ee044294abe68b776412b584af05`.
- The recordings come from the [producer run](https://github.com/framerslab/safeos/actions/runs/45680347578) at `5b60700b3f089ff8a8c4a89a20d21fc9afa134be`. The app stills come from an [earlier Pictures run](https://github.com/framerslab/safeos/actions/runs/45551367763).

| Image | View | SHA-256 |
| --- | --- | --- |
| [`before/home-first-390-dark.png`](before/home-first-390-dark.png) | Phone first screen, dark look | `3ca0ca6c8778e988118db2182a4b24e32be3759a79b841209dd2fd739d474a19` |
| [`before/home-first-390-light.png`](before/home-first-390-light.png) | Phone first screen, light look | `1d57576de5703e88a8d66ee5fbfb785698e3bef5c2d1c52926238a08a694d4ce` |
| [`before/home-first-1440-dark.png`](before/home-first-1440-dark.png) | Desktop first screen, dark look | `2c964ae392f9222e8f8945b50e07d9845fc0457f3b38a7a0393847b3b78ef9f8` |
| [`before/home-first-1440-light.png`](before/home-first-1440-light.png) | Desktop first screen, light look | `36fb58cdf613dfada6b98996575c4353e62a372bbb9847d1c53651ffd312364e` |
| [`after/home-first-390-dark.png`](after/home-first-390-dark.png) | Phone first screen, dark look, Watching poster | `3c0dcbe9035aff63a0a76035f37c080b08cfde1ac957fe4d5b9f491f514002cf` |
| [`after/home-first-390-light.png`](after/home-first-390-light.png) | Phone first screen, light look, Watching poster | `7527acf9f6d37b18e4ec47f8466badca36f33db83f13a7807f2be3b05e7fe02d` |
| [`after/home-first-1440-dark.png`](after/home-first-1440-dark.png) | Desktop first screen, dark look, Watching poster | `c55901008d07e30bf3c19de0a486909270c56edb306316b6524b05d79da97ec4` |
| [`after/home-first-1440-light.png`](after/home-first-1440-light.png) | Desktop first screen, light look, Watching poster | `ff25c5ff35ff40389c3629e1506750372fd4ae66f3f600a04fdd7877fa685795` |
| [`after/home-dashboard-390-dark.png`](after/home-dashboard-390-dark.png) | Phone Dashboard poster with both saved alerts, dark look | `88968f491c42456f922fd9d4cb4e0e3766ff0db854e8ce56a59a0f04d2afdff7` |
| [`after/home-dashboard-390-light.png`](after/home-dashboard-390-light.png) | Phone Dashboard poster with both saved alerts, light look | `bd729edb0df905f026e08aa2aebbdfde0fc5157b5e0008ef95ebf38940ae46ba` |
| [`after/home-dashboard-1440-dark.png`](after/home-dashboard-1440-dark.png) | Desktop Dashboard poster with both saved alerts, dark look | `3a230a81e44a1372d735b9a1c1b9bb7caa2be310c6f6ce91ab1cc8ab4e3dfb36` |
| [`after/home-dashboard-1440-light.png`](after/home-dashboard-1440-light.png) | Desktop Dashboard poster with both saved alerts, light look | `628645cea4b475c86ab56cd8124c8dc76e4e4e0f5be0a01470b83fd9d50bec4b` |
| [`after/home-watching-1440-dark.png`](after/home-watching-1440-dark.png) | Desktop Watching poster at the bark, dark look | `a3905df45506f0b6558168821aaa5e33a16d2e0ea35bdabf08303089ba018061` |
| [`after/home-watching-playing-1440-dark.png`](after/home-watching-playing-1440-dark.png) | Desktop Watching in playback, dark look | `72f0befb446586b584a5d2c7d7d8df8220d4e3352c02354ee210329c4a49a19d` |
| [`after/home-dashboard-playing-1440-dark.png`](after/home-dashboard-playing-1440-dark.png) | Desktop Dashboard in playback, dark look | `823e85e9f3bc5063be9c0560b4e8019ee201b05dea4f4a96145ea699ba023efa` |

## Readability

The after job measured 6,332 ranges across 66 images with 0 findings. The 592 recorded word boxes measured at least 9.52:1 contrast. The smallest projected font was 14.27 px. The raster height check allows one device pixel at each edge.

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

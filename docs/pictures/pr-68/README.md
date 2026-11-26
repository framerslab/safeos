# People, Wildlife and alert settings

The Pictures workflow opened the same states in Chromium in the base and
pull request builds. The monitoring PNGs come from the `monitoring-pictures-before`
and `monitoring-pictures-after` artifacts for head `559c253`.
[Pictures run](https://github.com/framerslab/safeos/actions/runs/45743322803)

The Wildlife movement control pictures use those artifacts from head `acce843`.
[Wildlife pictures run](https://github.com/framerslab/safeos/actions/runs/45886962780)

The picture-change walk uses a camera that changes a small part of a 1280 by
720 frame. It raises a Critical alert before and a Low alert after. The
People walk puts 130 unseen pictures in the library, opens the dashboard,
and reads the saved picture count in Data on this device. The speech walk
offers an online voice so Alert sounds can show what happens when the
browser offers no voice on the device. A second speech walk offers no voice
at all.

| What the pictures show | Phone, dark | Desktop, light |
| --- | --- | --- |
| Wildlife’s movement control | [Before](before/wildlife-motion-390-dark.png) · [After](after/wildlife-motion-390-dark.png) | [Before](before/wildlife-motion-1280-light.png) · [After](after/wildlife-motion-1280-light.png) |
| Picture change level | [Before](before/picture-change-level-390-dark.png) · [After](after/picture-change-level-390-dark.png) | [Before](before/picture-change-level-1280-light.png) · [After](after/picture-change-level-1280-light.png) |
| People picture count | [Before](before/people-picture-count-390-dark.png) · [After](after/people-picture-count-390-dark.png) | [Before](before/people-picture-count-1280-light.png) · [After](after/people-picture-count-1280-light.png) |
| Settings > Detection pitch choices | [Before](before/detection-pitch-390-dark.png) · [After](after/detection-pitch-390-dark.png) | [Before](before/detection-pitch-1280-light.png) · [After](after/detection-pitch-1280-light.png) |
| The watch’s audio settings | [Before](before/watch-audio-settings-390-dark.png) · [After](after/watch-audio-settings-390-dark.png) | [Before](before/watch-audio-settings-1280-light.png) · [After](after/watch-audio-settings-1280-light.png) |
| Alert sounds and voice choice | [Before](before/spoken-alerts-390-dark.png) · [After](after/spoken-alerts-390-dark.png) | [Before](before/spoken-alerts-1280-light.png) · [After](after/spoken-alerts-1280-light.png) |
| Alert sounds with no voice | [Before](before/spoken-alerts-no-voice-390-dark.png) · [After](after/spoken-alerts-no-voice-390-dark.png) | [Before](before/spoken-alerts-no-voice-1280-light.png) · [After](after/spoken-alerts-no-voice-1280-light.png) |
| The blog post’s cited code lines | [Before](before/blog-code-lines-390-dark.png) · [After](after/blog-code-lines-390-dark.png) | [Before](before/blog-code-lines-1280-light.png) · [After](after/blog-code-lines-1280-light.png) |

The blog post pictures are the full-page captures of
`/blog/how-safeos-guardian-works/` from the `pictures-before` and `pictures`
artifacts for head `eb32fb3`.
[Pictures run](https://github.com/framerslab/safeos/actions/runs/45757517143)
The post cites lines 74 to 76 of `CameraFeed.tsx` and 258 to 271 of
`monitor/page.tsx` before, and 99 to 101 and 324 to 336 after.

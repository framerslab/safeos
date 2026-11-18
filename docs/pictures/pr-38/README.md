# Blog model name pictures

Captured in CI for pull request #38 by the Pictures workflow, in
[run 44251962390](https://github.com/framerslab/safeos/actions/runs/44251962390):
the `pictures-before` artifact is master, the `pictures` artifact is the pull
request at 2554502. Each file is cut from the full-page capture of the post on
how SafeOS Guardian works, around its section "One model in the browser", at
its original pixels, at 1280 and 390 pixels wide, in the light and dark looks.

- `model-<width>-<look>-before.png`: the section as it was, calling the model
  "a quantized COCO-SSD".
- `model-<width>-<look>-after.png`: the section naming the model as it is: a
  pre-trained COCO-SSD on SSDLite MobileNet V2, its 4.5 million weights stored
  as 32-bit floats.

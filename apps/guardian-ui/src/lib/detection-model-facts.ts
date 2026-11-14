/**
 * The detection model's address and size
 *
 * Security and Wildlife download one object-detection model (COCO-SSD,
 * lite_mobilenet_v2) from Google's model storage after the person agrees.
 * Its address and its size are kept together here: the loader
 * (lib/detection-model) fetches the address, and every page that states the
 * size reads it from here.
 *
 * @module lib/detection-model-facts
 */

export const MODEL_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json';

/** The manifest (model.json), in bytes. */
export const MODEL_MANIFEST_BYTES = 527_315;

/** The five weight files together, in bytes. */
export const MODEL_WEIGHTS_BYTES = 18_034_528;

/** The whole download: the manifest and the weight files. */
export const MODEL_BYTES = MODEL_MANIFEST_BYTES + MODEL_WEIGHTS_BYTES;

/** The download in decimal megabytes to one place, as pages print it: "18.6". */
export const MODEL_SIZE_MB = new Intl.NumberFormat('en', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
}).format(MODEL_BYTES / 1_000_000);

/**
 * The kinds of animal the object-detection model knows
 *
 * COCO-SSD's own class names for animals, mapped to the detector's animal
 * types. The detector (lib/animal-detection) filters its predictions with
 * this list, and the home page prints the count and the names from it, so a
 * page can never name an animal the model does not know.
 *
 * @module lib/animal-kinds
 */

import type { AnimalType } from './animal-detection';

/** Maps COCO-SSD classes to the detector's animal types. */
export const COCO_TO_ANIMAL: Record<string, AnimalType> = {
  'dog': 'dog',
  'cat': 'cat',
  'bird': 'bird',
  'horse': 'horse',
  'sheep': 'sheep',
  'cow': 'cow',
  'elephant': 'elephant',
  'bear': 'bear',
  'zebra': 'zebra',
  'giraffe': 'giraffe',
};

/** All COCO-SSD animal classes, in the order the detector lists them. */
export const COCO_ANIMAL_CLASSES = Object.keys(COCO_TO_ANIMAL);

/**
 * The blog names the detection model as it is
 *
 * The post on how SafeOS Guardian works names the model the app downloads
 * (lib/detection-model-facts): COCO-SSD on SSDLite MobileNet V2, whose
 * manifest lists 239 float32 weight tensors and no quantized ones, about 4.5
 * million weights in all. The post called it quantized.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlogArticlePage from '@/app/blog/[slug]/page';
import { MODEL_URL } from '@/lib/detection-model-facts';

// next/image reads the browser's address, which this server render has none of.
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => React.createElement('img', { src, alt }),
}));

it('names the detection model the app downloads, with its weights as they are', () => {
  const html = renderToStaticMarkup(<BlogArticlePage params={{ slug: 'how-safeos-guardian-works' }} />);

  expect(MODEL_URL).toContain('ssdlite_mobilenet_v2');
  expect(html).toContain('on SSDLite MobileNet V2, its 4.5 million weights stored as 32-bit floats');
  expect(html).not.toMatch(/quantized/i);
});

it('cites the lines of person-detection.ts that hold the motion gate', () => {
  const html = renderToStaticMarkup(<BlogArticlePage params={{ slug: 'how-safeos-guardian-works' }} />);
  const cited = /lines (\d+)-(\d+): run detection when the motion level crosses its threshold/.exec(html);
  expect(cited).not.toBeNull();

  const source = readFileSync(path.join(__dirname, '../src/lib/person-detection.ts'), 'utf8').split('\n');
  const lines = source.slice(Number(cited?.[1]) - 1, Number(cited?.[2])).join('\n');
  expect(lines).toContain('const motionTriggered = motionLevel >= this.config.motionThreshold;');
  expect(lines).toContain('if (!motionTriggered) {');
  expect(lines).toContain('return null;');
});

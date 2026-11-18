/**
 * The blog names the detection model as it is
 *
 * The post on how SafeOS Guardian works names the model the app downloads
 * (lib/detection-model-facts): COCO-SSD on SSDLite MobileNet V2, whose
 * manifest lists 239 float32 weight tensors and no quantized ones, about 4.5
 * million weights in all. The post called it quantized.
 */
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
  expect(html).toContain('SSDLite MobileNet V2');
  expect(html).toContain('32-bit');
  expect(html).not.toMatch(/quantized/i);
});

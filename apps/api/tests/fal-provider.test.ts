import { describe, expect, it } from 'vitest';
import { FalJobProvider } from '../src/business/providers.js';
import { createMockPng } from '../src/business/mock-image.js';
import {
  FAL_EDIT_ENDPOINT,
  FAL_ENDPOINT,
} from '../src/modules/generation/fal.endpoints.js';
import type { FalProvider } from '../src/modules/generation/fal.provider.js';
import type { ValidatedGeneration } from '../src/modules/generation/generation.validators.js';

/**
 * The real fal.ai path cannot be called in tests (paid), so these tests lock
 * the official endpoint paths and the exact request shape the provider sends
 * for text-to-image and reference-image edit. Mock success alone would not
 * catch a wrong URL like the previous `/edit` (missing `/base`).
 */

const PNG = createMockPng();
const IMAGE_URL = 'https://v3b.fal.media/mock/generated.png';
const REF = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`;

function fakeFal(): {
  provider: FalProvider;
  calls: Array<{ endpoint: string; payload: Record<string, unknown> }>;
} {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  return {
    calls,
    provider: {
      calls,
      async generate({ endpoint, payload }) {
        calls.push({ endpoint, payload });
        return {
          imageUrl: IMAGE_URL,
          width: 1280,
          height: 720,
          contentType: 'image/png',
        };
      },
    },
  };
}

const fetcher = (async () =>
  new Response(PNG, {
    status: 200,
    headers: { 'content-type': 'image/png' },
  })) as typeof fetch;

function input(overrides: Partial<ValidatedGeneration> = {}): ValidatedGeneration {
  return {
    finalPrompt: 'Subject-preserving prompt. Palette: violet.',
    negativePrompt: 'blurry',
    promptVersion: 2,
    builderVersion: 2,
    imageSize: { width: 1280, height: 720 },
    refDataUri: null,
    style: null,
    ...overrides,
  };
}

describe('fal.ai endpoints and payload', () => {
  it('uses the official text-to-image endpoint', async () => {
    const fal = fakeFal();
    const job = new FalJobProvider(fal.provider, fetcher);
    const result = await job.generate(input(), AbortSignal.timeout(5_000));

    expect(FAL_ENDPOINT).toBe('https://fal.run/fal-ai/flux-2/klein/4b');
    expect(fal.calls[0].endpoint).toBe(FAL_ENDPOINT);
    const payload = fal.calls[0].payload;
    expect(payload).toMatchObject({
      prompt: 'Subject-preserving prompt. Palette: violet.',
      image_size: { width: 1280, height: 720 },
      num_images: 1,
      enable_safety_checker: true,
      output_format: 'png',
    });
    expect(payload.image_urls).toBeUndefined();
    expect(result.mime).toBe('image/png');
    expect(result.bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  it('uses the official /base/edit endpoint with image_urls for references', async () => {
    const fal = fakeFal();
    const job = new FalJobProvider(fal.provider, fetcher);
    await job.generate(
      input({ refDataUri: REF }),
      AbortSignal.timeout(5_000)
    );

    expect(FAL_EDIT_ENDPOINT).toBe(
      'https://fal.run/fal-ai/flux-2/klein/4b/base/edit'
    );
    expect(fal.calls[0].endpoint).toBe(FAL_EDIT_ENDPOINT);
    const payload = fal.calls[0].payload;
    expect(payload.image_urls).toEqual([REF]);
    expect(payload.prompt).toContain('Subject-preserving');
    expect(payload.image_size).toEqual({ width: 1280, height: 720 });
  });

  it('rejects a non-fal image download host', async () => {
    const fal: FalProvider = {
      calls: [],
      async generate() {
        return {
          imageUrl: 'https://evil.example/image.png',
          width: null,
          height: null,
          contentType: 'image/png',
        };
      },
    };
    const job = new FalJobProvider(fal, fetcher);
    await expect(
      job.generate(input(), AbortSignal.timeout(5_000))
    ).rejects.toThrow('UNTRUSTED_IMAGE_URL');
  });
});

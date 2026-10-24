import { describe, expect, it } from 'vitest';
import { validateGenerateBody } from '../src/modules/generation/generation.validators.js';
import { validateCustomSize } from '../src/catalog/sizes.js';

const base = { device: 'phone', prompt: 'a calm wallpaper' };

describe('custom output sizes (server)', () => {
  it('accepts aligned sizes within bounds and passes them to the provider', () => {
    const result = validateGenerateBody({ ...base, width: 1080, height: 1920 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.imageSize).toEqual({ width: 1080, height: 1920 });
  });

  it('accepts the exact maximum square', () => {
    const result = validateGenerateBody({ ...base, width: 2048, height: 2048 });
    expect(result.ok).toBe(true);
  });

  it('rejects non-integer, out-of-range, unaligned and oversized sizes', () => {
    const cases: Array<[number, number]> = [
      [1080.5, 1920],
      [400, 800],
      [4000, 4000],
      [1080, 1921],
      [2048, 2056],
    ];
    for (const [width, height] of cases) {
      const result = validateGenerateBody({ ...base, width, height });
      expect(result.ok, `${width}x${height}`).toBe(false);
    }
  });

  it('rejects a half-specified custom size and a preset+custom combination', () => {
    expect(validateGenerateBody({ ...base, width: 1080 }).ok).toBe(false);
    expect(validateGenerateBody({ ...base, height: 1920 }).ok).toBe(false);
    expect(
      validateGenerateBody({
        ...base,
        width: 1024,
        height: 1024,
        sizePresetId: 'phone-1024x1024',
      }).ok
    ).toBe(false);
  });

  it('requires an explicit ratio to agree with the custom size', () => {
    expect(
      validateGenerateBody({
        ...base,
        width: 1000,
        height: 1000,
        aspectRatio: '9:16',
      }).ok
    ).toBe(false);
    expect(
      validateGenerateBody({
        ...base,
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
      }).ok
    ).toBe(true);
  });

  it('exposes a reusable validator with precise reasons', () => {
    expect(validateCustomSize(1080, 1920)).toEqual({ ok: true, width: 1080, height: 1920 });
    expect(validateCustomSize('1080', 1920)).toMatchObject({ ok: false, reason: 'not-integer' });
    expect(validateCustomSize(511, 1920)).toMatchObject({ ok: false, reason: 'out-of-range' });
    expect(validateCustomSize(1080, 1901)).toMatchObject({ ok: false, reason: 'step' });
    expect(validateCustomSize(2048, 2048)).toMatchObject({ ok: true });
  });
});

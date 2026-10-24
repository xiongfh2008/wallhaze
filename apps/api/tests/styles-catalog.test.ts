import { describe, expect, it } from 'vitest';
import { WALLPAPER_STYLES, findStyle } from '../src/catalog/styles.js';

const NEW_IDS = [
  'paper-cut',
  'clay-3d',
  'low-poly',
  'stained-glass',
  'vaporwave',
  'botanical-illustration',
  'starry-galaxy',
  'mountain-lake',
  'deep-ocean',
  'aurora-nights',
  'architecture-minimal',
  'macro-nature',
  'soft-gradient',
  'abstract-light',
];

describe('server style catalog', () => {
  it('has unique ids and the original styles', () => {
    const ids = WALLPAPER_STYLES.map((style) => style.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findStyle('anime')).toBeTruthy();
    expect(findStyle('cozy-anime')).toBeTruthy();
  });

  it('accepts every new Studio style with a non-empty template', () => {
    for (const id of NEW_IDS) {
      const style = findStyle(id);
      expect(style, id).toBeTruthy();
      expect(style?.promptTemplate.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('gives the new mainstream styles real visual and motion metadata', async () => {
    const { resolveStyleMeta } = await import('../src/catalog/style-meta.js');
    const { resolveStyleMotionMeta } = await import('../src/catalog/style-motion.js');
    for (const id of NEW_IDS.slice(6)) {
      const style = findStyle(id);
      if (!style) throw new Error(id);
      const visual = resolveStyleMeta(style);
      expect(visual.palette.length).toBeGreaterThan(8);
      expect(visual.lighting.length).toBeGreaterThan(8);
      expect(visual.texture.length).toBeGreaterThan(8);
      expect(visual.composition.length).toBeGreaterThan(8);
      const motion = resolveStyleMotionMeta(style);
      expect(motion.motionGuidance.length).toBeGreaterThan(20);
      expect(motion.cameraGuidance.length).toBeGreaterThan(10);
    }
  });
});

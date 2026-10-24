import { describe, expect, it } from 'vitest';
import {
  buildGenerationPrompt,
  MAX_FINAL_PROMPT_LENGTH,
  PROMPT_BUILDER_VERSION,
  PromptBuildError,
} from '../src/catalog/prompt-builder.js';
import { findStyle } from '../src/catalog/styles.js';
import { validateGenerateBody } from '../src/modules/generation/generation.validators.js';
import { runGenerationRequest } from '../src/business/worker.js';

const anime = findStyle('anime')!;
const cyberpunk = findStyle('cyberpunk')!;

describe('prompt builder', () => {
  it('combines the scene, style template and structured visual axes', () => {
    const built = buildGenerationPrompt({
      userPrompt: 'an orange cat sitting by a rainy window',
      style: anime,
      device: 'phone',
      ratio: '9:16',
      hasReference: false,
    });
    expect(built.prompt).toContain('an orange cat sitting by a rainy window');
    expect(built.prompt).toContain(anime.promptTemplate);
    expect(built.prompt).toContain('Palette:');
    expect(built.prompt).toContain('Lighting:');
    expect(built.prompt).toContain('Texture:');
    expect(built.prompt).toContain('Composition:');
    expect(built.prompt).toContain('Vertical phone wallpaper composition');
    expect(built.prompt).toContain('9:16 portrait frame');
    expect(built.negativePrompt.length).toBeGreaterThan(10);
    expect(built.builderVersion).toBe(PROMPT_BUILDER_VERSION);
    expect(built.styleVersion).toBeGreaterThan(0);
  });

  it('does not append the style name as a lazy suffix; styles differ structurally', () => {
    const one = buildGenerationPrompt({
      userPrompt: 'a cat by a window', style: anime, device: 'desktop', hasReference: false,
    });
    const two = buildGenerationPrompt({
      userPrompt: 'a cat by a window', style: cyberpunk, device: 'desktop', hasReference: false,
    });
    expect(one.prompt).not.toContain('Anime.');
    expect(one.prompt).not.toBe(two.prompt);
    expect(two.prompt).toContain('neon magenta, cyan and deep violet');
  });

  it('adds subject-preservation rules only when a reference is present', () => {
    const plain = buildGenerationPrompt({
      userPrompt: 'a cat', style: anime, device: 'phone', hasReference: false,
    });
    const withRef = buildGenerationPrompt({
      userPrompt: 'a cat', style: anime, device: 'phone', hasReference: true,
    });
    expect(plain.prompt).not.toContain('reference photo');
    expect(withRef.prompt).toContain('reference photo as the main subject');
    expect(withRef.prompt).toContain('Preserve its distinctive appearance');
    expect(withRef.prompt).toContain('contact shadow');
    expect(withRef.prompt).toContain('not replace it with a different subject');
  });

  it('uses different framing guidance per device', () => {
    const phone = buildGenerationPrompt({ userPrompt: 'x', style: anime, device: 'phone', hasReference: false });
    const desktop = buildGenerationPrompt({ userPrompt: 'x', style: anime, device: 'desktop', hasReference: false });
    expect(phone.prompt).toContain('lock-screen clock area');
    expect(desktop.prompt).toContain('breathing room on the left and right');
  });

  it('supports a reference-only request with a neutral scene', () => {
    const built = buildGenerationPrompt({
      userPrompt: '', style: null, device: 'phone', hasReference: true,
    });
    expect(built.prompt).toContain('newly imagined wallpaper scene');
    expect(built.prompt).toContain('reference photo as the main subject');
  });

  it('rejects empty input and over-long final prompts', () => {
    expect(() =>
      buildGenerationPrompt({ userPrompt: '', style: null, device: 'phone', hasReference: false })
    ).toThrowError(PromptBuildError);
    try {
      buildGenerationPrompt({
        userPrompt: 'x'.repeat(MAX_FINAL_PROMPT_LENGTH + 100),
        style: null,
        device: 'phone',
        hasReference: false,
      });
      throw new Error('expected the builder to reject a long prompt');
    } catch (error) {
      expect(error).toMatchObject({ code: 'too-long' });
    }
  });
});

describe('validator integration', () => {
  it('returns the composed prompt and its versions', () => {
    const result = validateGenerateBody({
      device: 'desktop',
      prompt: 'a quiet lake at dawn',
      styleId: 'cinematic',
      aspectRatio: '16:9',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.finalPrompt).toContain('a quiet lake at dawn');
    expect(result.value.finalPrompt).toContain('teal and orange cinematic grade');
    expect(result.value.promptVersion).toBeGreaterThan(0);
    expect(result.value.builderVersion).toBe(PROMPT_BUILDER_VERSION);
    expect(result.value.negativePrompt).toBeTruthy();
  });
});

describe('worker prompt reproducibility', () => {
  const capture = () => {
    let seen: { finalPrompt: string } | null = null;
    const provider = {
      generate: async (input: { finalPrompt: string }) => {
        seen = input;
        return { bytes: Buffer.from('89504e470d0a1a0a00000000', 'hex'), mime: 'image/png' };
      },
    };
    return { provider, seen: () => seen };
  };

  it('uses the prompt persisted at enqueue time', async () => {
    const { provider, seen } = capture();
    await runGenerationRequest(
      {
        device: 'phone',
        styleId: 'anime',
        prompt: 'a cat',
        _composed: {
          builderVersion: PROMPT_BUILDER_VERSION,
          prompt: 'STORED PROMPT FOR THIS JOB',
          styleVersion: 2,
        },
      },
      provider
    );
    expect(seen()?.finalPrompt).toBe('STORED PROMPT FOR THIS JOB');
  });

  it('falls back to recomposition for legacy or stale jobs', async () => {
    const { provider, seen } = capture();
    await runGenerationRequest(
      {
        device: 'phone',
        styleId: 'anime',
        prompt: 'a cat',
        _composed: { builderVersion: 1, prompt: 'OLD PROMPT' },
      },
      provider
    );
    expect(seen()?.finalPrompt).toContain('a cat');
    expect(seen()?.finalPrompt).not.toBe('OLD PROMPT');
  });
});

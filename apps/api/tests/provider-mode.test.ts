import { describe, expect, it } from 'vitest';
import {
  isFlagEnabled,
  isVideoLiveAllowed,
  resolveGenerationMode,
} from '../src/business/provider-mode.js';

/**
 * Paid generation must be fail-closed: a FAL_KEY alone never enables real
 * billing; FAL_MOCK always wins; live requires an explicit opt-in.
 */
describe('generation mode selection', () => {
  it('never enables live calls from a key alone', () => {
    expect(resolveGenerationMode({ FAL_KEY: 'key' })).toBe('disabled');
    expect(
      resolveGenerationMode({ FAL_KEY: 'key', FAL_LIVE_ENABLED: '0' })
    ).toBe('disabled');
  });

  it('requires both FAL_LIVE_ENABLED and a key', () => {
    expect(
      resolveGenerationMode({ FAL_LIVE_ENABLED: '1', FAL_KEY: 'key' })
    ).toBe('live');
    expect(resolveGenerationMode({ FAL_LIVE_ENABLED: '1' })).toBe('disabled');
    expect(
      resolveGenerationMode({ FAL_LIVE_ENABLED: '1', FAL_KEY: '   ' })
    ).toBe('disabled');
  });

  it('lets mock mode win over a configured key', () => {
    expect(resolveGenerationMode({ FAL_MOCK: '1', FAL_KEY: 'key' })).toBe(
      'mock'
    );
    expect(
      resolveGenerationMode({
        FAL_MOCK: 'true',
        FAL_LIVE_ENABLED: '1',
        FAL_KEY: 'key',
      })
    ).toBe('mock');
  });

  it('is disabled with no flags', () => {
    expect(resolveGenerationMode({})).toBe('disabled');
    expect(resolveGenerationMode({ FAL_MOCK: '0' })).toBe('disabled');
  });

  it('requires a separate explicit video live opt-in', () => {
    expect(
      isVideoLiveAllowed({ FAL_LIVE_ENABLED: '1', FAL_KEY: 'key' })
    ).toBe(false);
    expect(
      isVideoLiveAllowed({
        FAL_LIVE_ENABLED: '1',
        FAL_VIDEO_LIVE_ENABLED: '0',
        FAL_KEY: 'key',
      })
    ).toBe(false);
    expect(
      isVideoLiveAllowed({
        FAL_LIVE_ENABLED: '1',
        FAL_VIDEO_LIVE_ENABLED: '1',
        FAL_KEY: 'key',
      })
    ).toBe(true);
    expect(
      isVideoLiveAllowed({ FAL_LIVE_ENABLED: '1', FAL_VIDEO_LIVE_ENABLED: '1' })
    ).toBe(false);
  });

  it('parses flags strictly', () => {
    expect(isFlagEnabled('1')).toBe(true);
    expect(isFlagEnabled(' TRUE ')).toBe(true);
    expect(isFlagEnabled('yes')).toBe(false);
    expect(isFlagEnabled(undefined)).toBe(false);
  });
});

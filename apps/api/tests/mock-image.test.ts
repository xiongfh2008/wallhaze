import { describe, expect, it } from 'vitest';
import { createMockPng } from '../src/business/mock-image.js';

describe('mock placeholder image', () => {
  it('is a structurally valid PNG with the expected dimensions', () => {
    const png = createMockPng(256);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    // IHDR chunk: length (4) + type (4) + data (13).
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
    expect(png.subarray(png.length - 8, png.length - 4).toString('ascii')).toBe('IEND');
    expect(png.length).toBeGreaterThan(500);
  });

  it('is deterministic', () => {
    expect(createMockPng(64).equals(createMockPng(64))).toBe(true);
  });
});

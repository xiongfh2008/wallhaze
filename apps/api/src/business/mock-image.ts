import { deflateSync } from "node:zlib";

/**
 * Development-only placeholder image for the mock provider.
 *
 * A valid RGB PNG (not a fake AI result): a violet gradient with a soft
 * radial glow. The UI marks mock results explicitly and does not charge
 * Credits for them, so this image can exercise the full pipeline honestly.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** Deterministic violet-gradient PNG used only by the mock provider. */
export function createMockPng(size = 768): Buffer {
  const width = size;
  const height = size;
  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height);
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.hypot(cx, cy);

  for (let y = 0; y < height; y++) {
    const row = y * rowLength;
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const t = (x + y) / (width + height);
      const glow = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / maxDist);
      const r = Math.round(26 + t * 96 + glow * 70);
      const g = Math.round(11 + t * 45 + glow * 20);
      const b = Math.round(46 + t * 160 + glow * 120);
      const i = row + 1 + x * 3;
      raw[i] = Math.min(255, r);
      raw[i + 1] = Math.min(255, g);
      raw[i + 2] = Math.min(255, b);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

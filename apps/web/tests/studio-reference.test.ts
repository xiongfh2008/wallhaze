import { describe, expect, it } from "vitest";
import {
  REF_MAX_BYTES,
  classifyReferenceFile,
  detectImageMime,
  mimeMatchesHeader,
  readFileHeader,
} from "@/lib/studio/reference";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const TEXT_BYTES = Uint8Array.from(
  "Hello, world!".split("").map((char) => char.charCodeAt(0))
);

describe("reference image classification", () => {
  it("rejects empty and non-finite sizes first", () => {
    expect(classifyReferenceFile({ name: "a.png", size: 0, type: "image/png" })).toBe("empty");
    expect(classifyReferenceFile({ name: "a.png", size: -1, type: "image/png" })).toBe("empty");
    expect(
      classifyReferenceFile({ name: "a.png", size: Number.NaN, type: "image/png" })
    ).toBe("empty");
  });

  it("rejects files above the 5 MiB contract limit", () => {
    expect(
      classifyReferenceFile({
        name: "big.png",
        size: REF_MAX_BYTES + 1,
        type: "image/png",
      })
    ).toBe("too-large");
  });

  it("accepts a file at exactly the limit", () => {
    expect(
      classifyReferenceFile({
        name: "edge.png",
        size: REF_MAX_BYTES,
        type: "image/png",
      })
    ).toBeNull();
  });

  it("rejects undeclared MIME types and accepts the three contract types", () => {
    expect(classifyReferenceFile({ name: "a.gif", size: 10, type: "image/gif" })).toBe("format");
    expect(classifyReferenceFile({ name: "a", size: 10, type: "" })).toBe("format");
    expect(classifyReferenceFile({ name: "a.png", size: 10, type: "image/png" })).toBeNull();
    expect(classifyReferenceFile({ name: "a.jpg", size: 10, type: "image/jpeg" })).toBeNull();
    expect(classifyReferenceFile({ name: "a.webp", size: 10, type: "image/webp" })).toBeNull();
  });
});

describe("magic-byte detection", () => {
  it("identifies PNG, JPEG and WebP headers", () => {
    expect(detectImageMime(PNG_BYTES)).toBe("image/png");
    expect(detectImageMime(JPEG_BYTES)).toBe("image/jpeg");
    expect(detectImageMime(WEBP_BYTES)).toBe("image/webp");
  });

  it("returns null for unknown content, null and undefined", () => {
    expect(detectImageMime(TEXT_BYTES)).toBeNull();
    expect(detectImageMime(null)).toBeNull();
    expect(detectImageMime(undefined)).toBeNull();
  });

  it("rejects truncated and corrupted signatures", () => {
    // PNG prefix shorter than the full 8-byte signature.
    expect(detectImageMime(PNG_BYTES.slice(0, 4))).toBeNull();
    // One wrong byte breaks the PNG signature.
    const corrupted = Uint8Array.from(PNG_BYTES);
    corrupted[7] = 0x0b;
    expect(detectImageMime(corrupted)).toBeNull();
    // A 3-byte buffer is below the minimum inspection length.
    expect(detectImageMime(JPEG_BYTES.slice(0, 3))).toBeNull();
    // WebP requires the full 12-byte RIFF/WEBP header.
    expect(detectImageMime(WEBP_BYTES.slice(0, 8))).toBeNull();
  });
});

describe("declared MIME vs header agreement", () => {
  it("accepts matching declarations", () => {
    expect(mimeMatchesHeader("image/png", PNG_BYTES)).toBe(true);
    expect(mimeMatchesHeader("image/jpeg", JPEG_BYTES)).toBe(true);
    expect(mimeMatchesHeader("image/webp", WEBP_BYTES)).toBe(true);
  });

  it("rejects obvious mismatches", () => {
    expect(mimeMatchesHeader("image/jpeg", PNG_BYTES)).toBe(false);
    expect(mimeMatchesHeader("image/png", JPEG_BYTES)).toBe(false);
  });

  it("defers undetectable files to the server", () => {
    expect(mimeMatchesHeader("image/png", TEXT_BYTES)).toBe(true);
    expect(mimeMatchesHeader("image/png", null)).toBe(true);
  });
});

describe("readFileHeader", () => {
  it("reads the requested number of leading bytes from a Blob", async () => {
    const blob = new Blob([PNG_BYTES]);
    const header = await readFileHeader(blob, 4);
    expect(header).not.toBeNull();
    expect(Array.from(header as Uint8Array)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("caps the read at the available length", async () => {
    const blob = new Blob([JPEG_BYTES.slice(0, 6)]);
    const header = await readFileHeader(blob, 12);
    expect(header).not.toBeNull();
    expect((header as Uint8Array).length).toBe(6);
  });

  it("resolves null instead of throwing on unreadable input", async () => {
    const broken = {
      slice(): Blob {
        throw new Error("unreadable");
      },
    } as unknown as Blob;
    await expect(readFileHeader(broken)).resolves.toBeNull();
  });
});

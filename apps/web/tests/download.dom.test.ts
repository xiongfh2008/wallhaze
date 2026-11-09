/**
 * downloadImage strategy tests (jsdom — real DOM anchor/iframe objects).
 *
 * Regression coverage for "clicking Download opens the image instead of
 * downloading": API-served signed media must survive a CORS-blocked blob
 * fetch by switching to the API's Content-Disposition download (download=1)
 * through a hidden iframe — never degrade to an inline viewer tab.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadImage } from "@/lib/download";

const API_BASE = "https://api.wallhaze.test";
const SIGNED_IMAGE = `${API_BASE}/v1/creations/job-1/image?exp=9999&sig=abc`;

/** Anchor .click() would fire jsdom's "not implemented" navigation error. */
beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  // jsdom has no blob URL store — the success path only needs stable stubs.
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:mock-object-url"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllEnvs();
});

describe("downloadImage", () => {
  it("downloads API media via hidden iframe when the blob fetch is CORS-blocked", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", API_BASE);
    // The exact failure a CORS allowlist mismatch produces in the browser.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(null);

    const result = await downloadImage({
      url: SIGNED_IMAGE,
      baseName: "wallhaze-wallpaper-20261110-120000",
    });

    expect(result).toBe("downloaded");
    const frame = document.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame!.getAttribute("sandbox")).toBe("allow-downloads");
    expect(frame!.getAttribute("src")).toBe(
      `${SIGNED_IMAGE}&download=1`
    );
    // The viewer-tab fallback must NOT run for API media.
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("does not duplicate download=1 when the URL already carries it", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", API_BASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    const withParam = `${SIGNED_IMAGE}&download=1`;
    await downloadImage({ url: withParam, baseName: "x" });

    const frame = document.querySelector("iframe");
    expect(frame!.getAttribute("src")).toBe(withParam);
  });

  it("keeps the blob path for API media when the fetch succeeds", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", API_BASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        })
      )
    );

    const result = await downloadImage({
      url: SIGNED_IMAGE,
      baseName: "wallhaze-wallpaper-20261110-120000",
      fallbackMime: "image/png",
    });

    expect(result).toBe("downloaded");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("falls back to a viewer tab only for non-API URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", API_BASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({ opener: null } as unknown as Window);

    const result = await downloadImage({
      url: "https://images.example.test/art.png",
      baseName: "wallhaze-gallery",
    });

    expect(result).toBe("opened");
    expect(openSpy).toHaveBeenCalledWith(
      "https://images.example.test/art.png",
      "_blank"
    );
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("reports failed when the popup is blocked for non-API URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", API_BASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    vi.spyOn(window, "open").mockReturnValue(null);

    const result = await downloadImage({
      url: "https://images.example.test/art.png",
      baseName: "wallhaze-gallery",
    });

    expect(result).toBe("failed");
  });
});

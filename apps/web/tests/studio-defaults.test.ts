import { describe, expect, it } from "vitest";
import { STUDIO_DEFAULT_STYLE_ID } from "@/lib/studio/defaults";
import { validatePromptPair } from "@/lib/studio/form";
import { findStyle } from "@/lib/styles";

describe("Studio primary-flow defaults", () => {
  it("opens with a real, selectable style", () => {
    const style = findStyle(STUDIO_DEFAULT_STYLE_ID);
    expect(style).toBeDefined();
    expect(style?.promptTemplate.length).toBeGreaterThan(0);
  });

  it("allows Generate with an empty optional description", () => {
    expect(validatePromptPair("", STUDIO_DEFAULT_STYLE_ID)).toEqual({
      ok: true,
    });
    expect(validatePromptPair("   ", STUDIO_DEFAULT_STYLE_ID)).toEqual({
      ok: true,
    });
  });

  it("still requires either a prompt or a style", () => {
    expect(validatePromptPair("", null)).toMatchObject({
      ok: false,
      code: "empty",
    });
  });
});

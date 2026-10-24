import { describe, expect, it } from "vitest";
import {
  buildVideoPrompt,
  VIDEO_PROMPT_BUILDER_VERSION,
} from "../src/catalog/prompt-builder.js";
import { findStyle } from "../src/catalog/styles.js";
import { validateVideoBody } from "../src/modules/generation/video.validators.js";

const anime = findStyle("anime-fantasy")!;

describe("video prompt builder", () => {
  it("combines the style look, motion axes, source preservation and loop intent", () => {
    const built = buildVideoPrompt({
      userPrompt: "a girl under cherry blossoms",
      motionPrompt: "petals fall slowly and her hair sways",
      style: anime,
      device: "phone",
      ratio: "9:16",
      generationMode: "image_to_video",
      durationSeconds: 5,
      hasSourceImage: true,
    });
    expect(built.prompt).toContain("a girl under cherry blossoms");
    expect(built.prompt).toContain(anime.promptTemplate);
    expect(built.prompt).toContain("petals fall slowly and her hair sways");
    expect(built.prompt).toContain("Preserve the original subject identity");
    expect(built.prompt).toContain("Camera:");
    expect(built.prompt).toContain("Loop intent:");
    expect(built.prompt).toContain("5 seconds");
    expect(built.builderVersion).toBe(VIDEO_PROMPT_BUILDER_VERSION);
    expect(built.negativePrompt).toContain("scene cut");
    expect(built.styleMotionGuidance.length).toBeGreaterThan(20);
  });

  it("uses style motion defaults when no user motion is supplied", () => {
    const built = buildVideoPrompt({
      userPrompt: "a quiet forest",
      motionPrompt: "",
      style: anime,
      device: "desktop",
      ratio: "16:9",
      generationMode: "text_to_video",
      durationSeconds: 5,
      hasSourceImage: false,
    });
    expect(built.prompt).toContain("Motion:");
    expect(built.prompt).toContain("Motion intensity:");
  });

  it("validates duration, ratio and source requirements per mode", () => {
    const unsupported = validateVideoBody(
      {
        mediaType: "video",
        generationMode: "image_to_video",
        device: "phone",
        aspectRatio: "9:16",
        durationSeconds: 3,
        motionPrompt: "petals",
        refImage: "data:image/png;base64,iVBORw0KGgo=",
      },
      "mock"
    );
    expect(unsupported.ok).toBe(false);
    expect(unsupported.ok ? "" : unsupported.logOutcome).toBe("rejected:video:duration");

    const noSource = validateVideoBody(
      {
        mediaType: "video",
        generationMode: "image_to_video",
        device: "phone",
        aspectRatio: "9:16",
        durationSeconds: 5,
        motionPrompt: "petals",
      },
      "mock"
    );
    expect(noSource.ok).toBe(false);

    const valid = validateVideoBody(
      {
        mediaType: "video",
        generationMode: "text_to_video",
        device: "phone",
        aspectRatio: "9:16",
        durationSeconds: 3,
        prompt: "a dreamy sky"
,
        styleId: "anime-fantasy",
      },
      "mock"
    );
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value.durationSeconds).toBe(3);
      expect(valid.value.generationMode).toBe("text_to_video");
    }
  });
});

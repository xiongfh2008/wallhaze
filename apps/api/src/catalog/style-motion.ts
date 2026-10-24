import type { WallStyle } from "./styles.js";

/**
 * Motion vocabulary for video generation. The static style still controls
 * the look; these fields control WHAT may move, HOW FAR, and how the camera
 * behaves. Defaults are conservative so no style requests chaotic motion.
 */
export interface StyleMotionMeta {
  /** Natural subject/scene motion allowed for this style. */
  motionGuidance: string;
  /** Camera behavior; locked-off by default to preserve composition. */
  cameraGuidance: string;
  /** Intended loop character (never a guarantee of seamless stitching). */
  loopIntent: string;
  /** Strength bucket used in the prompt, not a provider parameter. */
  intensity: "subtle" | "moderate";
}

const DEFAULT_MOTION: StyleMotionMeta = {
  motionGuidance:
    "gentle ambient motion only — slow light changes, drifting haze and small secondary details",
  cameraGuidance: "locked-off camera with no pan, zoom, crop or scene cut",
  loopIntent:
    "prefer motion that can loop softly; do not claim a seamless loop unless the video actually matches at both ends",
  intensity: "subtle",
};

const BY_CATEGORY: Record<string, Partial<StyleMotionMeta>> = {
  anime: {
    motionGuidance:
      "gentle anime motion — hair and fabric swaying, petals or dust drifting, soft light shifts and restrained background parallax",
    cameraGuidance: "stable cinematic camera with no cuts or dramatic shake",
    intensity: "subtle",
  },
  digital: {
    motionGuidance:
      "subtle parallax in digital layers, soft glow pulsing and small sparkle drift",
    intensity: "subtle",
  },
  abstract: {
    motionGuidance:
      "slow gradient flow, soft particle drift and gentle shape breathing; no sudden flashes",
    intensity: "subtle",
  },
  sketch: {
    motionGuidance:
      "very restrained paper-like motion — slight line shimmer and drifting dust; keep the drawing readable",
    intensity: "subtle",
  },
  painting: {
    motionGuidance:
      "slow painterly light shifting and subtle texture movement, as if the canvas is alive",
    intensity: "subtle",
  },
  photography: {
    motionGuidance:
      "natural environmental motion — drifting clouds, water ripples, leaves and soft light changes",
    cameraGuidance: "locked-off camera or an almost imperceptible slow drift",
    intensity: "subtle",
  },
  nature: {
    motionGuidance:
      "wind moving foliage, water rippling, clouds drifting and light shifting naturally",
    intensity: "moderate",
  },
  horror: {
    motionGuidance:
      "oppressive minimal motion — shifting fog, flickering distant light and faint shadow movement; no jump scares or monster morphs",
    cameraGuidance: "locked-off camera with an unsettling stillness",
    intensity: "subtle",
  },
};

const BY_STYLE: Partial<Record<string, Partial<StyleMotionMeta>>> = {
  "starry-galaxy": {
    motionGuidance: "very slow nebula drift, gentle star twinkle and a rare shooting star; keep the field stable",
    cameraGuidance: "almost imperceptible slow drift; no cuts",
    intensity: "subtle",
  },
  "mountain-lake": {
    motionGuidance: "soft water ripples, slow mist drift and faint moon glow; keep the ridge line stable",
    cameraGuidance: "locked-off camera",
    intensity: "subtle",
  },
  "deep-ocean": {
    motionGuidance: "slow jellyfish bell pulse, drifting tentacles, rising bubbles and shifting caustic light",
    cameraGuidance: "very slow floating drift; no cuts",
    intensity: "subtle",
  },
  "aurora-nights": {
    motionGuidance: "aurora curtains shimmering and slowly folding, stars twinkling and faint mist over the land",
    cameraGuidance: "locked-off wide landscape",
    intensity: "subtle",
  },
  "architecture-minimal": {
    motionGuidance: "slow shifting daylight and shadows, gentle curtain or plant movement, still architecture",
    cameraGuidance: "very slow lateral drift",
    intensity: "subtle",
  },
  "macro-nature": {
    motionGuidance: "tiny leaf sway, dew highlights shimmering and soft bokeh breathing; no focus hunting",
    cameraGuidance: "locked-off macro camera",
    intensity: "subtle",
  },
  "soft-gradient": {
    motionGuidance: "slow layered color flow and gentle glow breathing; no flashes",
    cameraGuidance: "locked-off camera",
    intensity: "subtle",
  },
  "abstract-light": {
    motionGuidance: "luminous ribbons drifting slowly and soft bloom breathing",
    cameraGuidance: "very slow drift with no cuts",
    intensity: "subtle",
  },

  anime: {
    motionGuidance:
      "hair and fabric swaying in a light breeze, cherry petals or dust drifting, soft background parallax and restrained character breathing",
    cameraGuidance: "stable cinematic camera with a very slight push-in; no cuts",
    intensity: "subtle",
  },
  "retro-cel": {
    motionGuidance:
      "vintage anime hair and clothing movement, film-grain shimmer and slow background cloud drift",
    intensity: "subtle",
  },
  shoujo: {
    motionGuidance:
      "sparkles drifting, hair and ribbons swaying, flower petals floating and soft blush-light pulses",
    intensity: "subtle",
  },
  shonen: {
    motionGuidance:
      "dynamic hair and clothing motion, speed-line energy and dust particles; keep the character's face and silhouette stable",
    cameraGuidance: "a short controlled camera push, no cuts or shake loops",
    intensity: "moderate",
  },
  chibi: {
    motionGuidance:
      "playful bobbing, tiny sparkle drift and soft squash-like breathing without deforming the character",
    intensity: "subtle",
  },
  mecha: {
    motionGuidance:
      "subtle mechanical parts shifting, steam drifting and blinking lights; avoid transforming the whole robot",
    cameraGuidance: "locked-off or very slow orbital drift",
    intensity: "subtle",
  },
  "cozy-anime": {
    motionGuidance:
      "warm light flicker, steam rising, curtains and grass swaying gently, slow cloud drift",
    intensity: "subtle",
  },
  "cyberpunk": {
    motionGuidance:
      "neon sign flicker, rain streaks, wet reflections and drifting holographic haze",
    cameraGuidance: "locked-off street-level camera with subtle light movement",
    intensity: "moderate",
  },
  nature: {
    motionGuidance:
      "wind through grass, water ripples, drifting mist and slow cloud movement",
    intensity: "moderate",
  },
  "dark-fantasy": {
    motionGuidance:
      "drifting fog, embers floating, subtle cloak movement and distant magic shimmer; no creature transformation",
    intensity: "subtle",
  },
  "chinese-ink": {
    motionGuidance:
      "ink washes blooming slowly, mist drifting and a few brush-like particles; keep the paper surface stable",
    intensity: "subtle",
  },
  "3d-cartoon": {
    motionGuidance:
      "soft character breathing, tiny sparkle drift and gentle ambient light changes; preserve the sculpted shapes",
    intensity: "subtle",
  },
};

export function resolveStyleMotionMeta(style: WallStyle | null): StyleMotionMeta {
  if (!style) return DEFAULT_MOTION;
  const category = BY_CATEGORY[style.category ?? "digital"] ?? {};
  const override = BY_STYLE[style.id] ?? {};
  return { ...DEFAULT_MOTION, ...category, ...override };
}

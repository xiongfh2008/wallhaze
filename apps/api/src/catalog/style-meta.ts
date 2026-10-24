import type { StyleCategory, StyleId, WallStyle } from "./styles.js";

/**
 * Structured visual metadata resolved for every style.
 *
 * The per-style `promptTemplate` carries the distinctive look; these fields
 * add the reusable visual axes (palette, light, texture, composition) that
 * the Prompt Builder combines with the scene and the target device. Styles
 * without an explicit override inherit their category's baseline, so every
 * style resolves all four axes without duplicating near-identical strings.
 */

export interface StyleVisualMeta {
  palette: string;
  lighting: string;
  texture: string;
  composition: string;
  negativePrompt: string;
}

/** Template revision stored with every generated prompt. */
export const STYLE_PROMPT_VERSION = 2;

const DEFAULT_NEGATIVE =
  "text, watermark, logo, signature, blurry, low quality, deformed anatomy, duplicate subject";

const CATEGORY_META: Record<StyleCategory, Omit<StyleVisualMeta, "negativePrompt">> = {
  anime: {
    palette: "expressive anime color with clean cel accents",
    lighting: "soft cel-shaded light with readable rim highlights",
    texture: "clean line art and controlled cel shading",
    composition: "character-led cinematic framing with a clear readable silhouette",
  },
  digital: {
    palette: "saturated digital color with clear accents",
    lighting: "clean studio or neon light with crisp highlights",
    texture: "polished digital rendering with fine detail",
    composition: "bold focal subject with layered depth",
  },
  abstract: {
    palette: "restrained gradient palette",
    lighting: "soft directional glow",
    texture: "smooth gradients with subtle grain",
    composition: "generous negative space and balanced shapes",
  },
  sketch: {
    palette: "monochrome graphite and ink tones",
    lighting: "soft diffused light",
    texture: "visible hand-drawn strokes on textured paper",
    composition: "centered study with a hand-drawn frame",
  },
  painting: {
    palette: "rich painterly color",
    lighting: "dramatic chiaroscuro",
    texture: "visible brushwork and canvas grain",
    composition: "classical balanced composition",
  },
  photography: {
    palette: "natural color grade",
    lighting: "realistic available light with depth",
    texture: "fine photographic grain",
    composition: "rule-of-thirds framing with layered depth",
  },
  nature: {
    palette: "earthy greens and cool sky tones",
    lighting: "natural atmospheric light",
    texture: "crisp natural detail",
    composition: "wide vista with foreground, midground and background layers",
  },
  horror: {
    palette: "desaturated dark palette",
    lighting: "low-key dramatic light",
    texture: "gritty film grain",
    composition: "unsettling negative space with hidden detail",
  },
};

const OVERRIDES: Partial<Record<StyleId, Partial<StyleVisualMeta>>> = {
  anime: {
    palette: "vibrant anime color with pastel accents",
    lighting: "soft cel-shaded light and rim highlights",
    texture: "clean line art with flat cel shading",
    composition: "dynamic character focus with a readable silhouette",
  },
  cyberpunk: {
    palette: "neon magenta, cyan and deep violet",
    lighting: "neon practical light with wet reflections",
    texture: "glossy wet surfaces and volumetric haze",
    composition: "vertical city depth with strong foreground framing",
  },
  fantasy: {
    palette: "jewel-toned palette with glowing highlights",
    lighting: "magical volumetric light and god rays",
    texture: "painterly detail with soft atmospheric layers",
    composition: "epic scale with a clear foreground subject",
  },
  minimalist: {
    palette: "monochrome field with one accent color",
    lighting: "soft gradient light",
    texture: "smooth matte surfaces",
    composition: "extreme negative space with one clear subject",
  },
  cinematic: {
    palette: "teal and orange cinematic grade",
    lighting: "anamorphic key light with practical highlights",
    texture: "film grain and shallow depth of field",
    composition: "widescreen staging with layered foreground",
  },
  watercolor: {
    palette: "translucent pigment washes",
    lighting: "soft natural light",
    texture: "wet-on-wet paper texture with blooming edges",
    composition: "airy asymmetric composition",
  },
  "oil-painting": {
    palette: "deep earth tones and warm highlights",
    lighting: "chiaroscuro with a single strong light source",
    texture: "thick impasto brushwork",
    composition: "classical diagonal composition",
  },
  "pixel-art": {
    palette: "limited retro palette",
    lighting: "flat sprite lighting",
    texture: "crisp pixel dithering",
    composition: "grid-aligned composition with readable shapes",
  },
  photography: {
    palette: "natural color with restrained saturation",
    lighting: "available light with realistic falloff",
    texture: "fine photographic grain",
    composition: "documentary framing with clear subject separation",
  },
  "paper-cut": {
    palette: "layered craft-paper colors",
    lighting: "soft shadowed paper depth",
    texture: "cut paper edges and fibrous texture",
    composition: "layered flat shapes with visible depth",
  },
  "clay-3d": {
    palette: "muted plasticine colors",
    lighting: "soft studio light with gentle shadows",
    texture: "matte clay with subtle fingerprints",
    composition: "rounded toy-like staging",
  },
  "low-poly": {
    palette: "gradient facets with cool shadows",
    lighting: "flat-shaded polygon light",
    texture: "faceted low-poly surfaces",
    composition: "geometric minimalist framing",
  },
  "stained-glass": {
    palette: "jewel-toned glass with dark lead lines",
    lighting: "backlit luminous glass",
    texture: "leaded glass panes",
    composition: "symmetrical cathedral window framing",
  },
  vaporwave: {
    palette: "neon pink, cyan and sunset purple",
    lighting: "retro neon glow",
    texture: "chrome reflections and VHS haze",
    composition: "retro grid horizon with centered subject",
  },
  "starry-galaxy": {
    palette: "deep blue, emerald and magenta nebula color",
    lighting: "self-luminous gas clouds and dense star points",
    texture: "fine cosmic dust, star fields and soft nebula filaments",
    composition: "vast deep-space field with layered nebula structures",
  },
  "mountain-lake": {
    palette: "cold blue hour with silver moon and deep forest silhouettes",
    lighting: "soft moonlight and atmospheric haze",
    texture: "mirror-calm water, dark conifers and fine night grain",
    composition: "wide mirrored horizon with layered ridges",
  },
  "deep-ocean": {
    palette: "abyssal blue with bioluminescent amber and cyan",
    lighting: "soft volumetric light from the surface",
    texture: "translucent jellyfish tissue, drifting particles and caustics",
    composition: "single luminous subject in deep negative space",
  },
  "aurora-nights": {
    palette: "emerald, violet and deep night blue",
    lighting: "luminous aurora curtains above a dark landscape",
    texture: "fine stars, cold haze and silhouetted pines",
    composition: "wide arctic landscape with a low horizon",
  },
  "architecture-minimal": {
    palette: "warm white, stone and restrained black accents",
    lighting: "soft daylight with clean geometric shadows",
    texture: "matte plaster, glass and precise architectural edges",
    composition: "asymmetric geometric framing with generous negative space",
  },
  "macro-nature": {
    palette: "fresh green and translucent white highlights",
    lighting: "soft diffused daylight with bright specular droplets",
    texture: "dew, leaf veins and shallow photographic bokeh",
    composition: "extreme close-up with one clear focal droplet",
  },
  "soft-gradient": {
    palette: "pastel violet, rose and amber",
    lighting: "soft internal gradient glow",
    texture: "smooth color fields with very fine grain",
    composition: "calm layered color fields with generous space",
  },
  "abstract-light": {
    palette: "prismatic magenta, cyan and amber on near-black",
    lighting: "luminous long-exposure light ribbons",
    texture: "soft bloom and fine film grain",
    composition: "flowing diagonal ribbons with deep negative space",
  },
  "botanical-illustration": {
    palette: "muted herbarium greens and cream",
    lighting: "soft even daylight",
    texture: "fine ink linework and watercolor washes",
    composition: "specimen study with generous white space",
  },
};

export function resolveStyleMeta(style: WallStyle): StyleVisualMeta {
  const category = style.category ?? "digital";
  const base = CATEGORY_META[category] ?? CATEGORY_META.digital;
  return {
    ...base,
    negativePrompt: DEFAULT_NEGATIVE,
    ...OVERRIDES[style.id],
  };
}

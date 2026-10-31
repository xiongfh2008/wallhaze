import type { StyleId } from "@/lib/styles";
import type { DeviceCategory } from "@/lib/media";

/**
 * Motion demos for the explore page and the Studio's video tab.
 * 2026-10-31: the six public demos are original AI-generated live
 * wallpapers (see LIVE_DEMOS below); the eight retired CC0-photo demos are
 * kept in ARCHIVED_LIVE_DEMOS for the audit trail.
 */
export type LiveDemoLicense = "cc0" | "public-domain" | "self-authored";

export interface LiveDemoSource {
  title: string;
  pageUrl: string | null;
  author: string;
  license: LiveDemoLicense;
  licenseUrl: string | null;
  productionMethod: string;
  aiGenerated: boolean;
}

export interface LiveDemo {
  id: string;
  styleId: StyleId;
  video: string;
  poster: string;
  width: number;
  height: number;
  durationSeconds: number;
  devices: DeviceCategory[];
  kind: "demo";
  license: LiveDemoLicense;
  source: LiveDemoSource;
}


/**
 * The six public demos — original AI-generated live wallpapers
 * (owner-directed batch 2026-10-31). Provenance: first frame via
 * fal-ai/flux-2/klein/4b, motion via fal-ai/wan/v2.2-5b/image-to-video
 * (720p, silent, safety checker enabled), ffmpeg tail-into-head crossfade
 * for a seamless wrap. Full prompts/seeds live in the internal generation
 * record and the media-rights registry, not on the site.
 */
export const LIVE_DEMOS: readonly LiveDemo[] = [
  {
    id: "haunted-manor",
    styleId: "gothic-horror",
    video: "/videos/live-demos/haunted-manor.mp4",
    poster: "/videos/live-demos/haunted-manor.jpg",
    width: 1280,
    height: 704,
    durationSeconds: 4.3,
    devices: ["desktop"],
    kind: "demo",
    license: "self-authored",
    source: {
      title: "WallHaze original — Haunted Manor",
      pageUrl: null,
      author: "WallHaze (self-authored)",
      license: "self-authored",
      licenseUrl: null,
      productionMethod:
        "First frame via fal-ai/flux-2/klein/4b; motion via fal-ai/wan/v2.2-5b/image-to-video (720p, silent, safety checker on); ffmpeg loop blend",
      aiGenerated: true,
    },
  },
  {
    id: "sakura-night-anime",
    styleId: "cozy-anime",
    video: "/videos/live-demos/sakura-night-anime.mp4",
    poster: "/videos/live-demos/sakura-night-anime.jpg",
    width: 1280,
    height: 704,
    durationSeconds: 4.3,
    devices: ["desktop"],
    kind: "demo",
    license: "self-authored",
    source: {
      title: "WallHaze original — Sakura Night",
      pageUrl: null,
      author: "WallHaze (self-authored)",
      license: "self-authored",
      licenseUrl: null,
      productionMethod:
        "First frame via fal-ai/flux-2/klein/4b; motion via fal-ai/wan/v2.2-5b/image-to-video (720p, silent, safety checker on); ffmpeg loop blend",
      aiGenerated: true,
    },
  },
  {
    id: "seoul-neon-rain",
    styleId: "cyberpunk",
    video: "/videos/live-demos/seoul-neon-rain.mp4",
    poster: "/videos/live-demos/seoul-neon-rain.jpg",
    width: 1280,
    height: 704,
    durationSeconds: 4.3,
    devices: ["desktop"],
    kind: "demo",
    license: "self-authored",
    source: {
      title: "WallHaze original — Seoul Neon Rain",
      pageUrl: null,
      author: "WallHaze (self-authored)",
      license: "self-authored",
      licenseUrl: null,
      productionMethod:
        "First frame via fal-ai/flux-2/klein/4b; motion via fal-ai/wan/v2.2-5b/image-to-video (720p, silent, safety checker on); ffmpeg loop blend",
      aiGenerated: true,
    },
  },
  {
    id: "mecha-awakening",
    styleId: "mecha",
    video: "/videos/live-demos/mecha-awakening.mp4",
    poster: "/videos/live-demos/mecha-awakening.jpg",
    width: 1280,
    height: 704,
    durationSeconds: 4.3,
    devices: ["desktop"],
    kind: "demo",
    license: "self-authored",
    source: {
      title: "WallHaze original — Mecha Awakening",
      pageUrl: null,
      author: "WallHaze (self-authored)",
      license: "self-authored",
      licenseUrl: null,
      productionMethod:
        "First frame via fal-ai/flux-2/klein/4b; motion via fal-ai/wan/v2.2-5b/image-to-video (720p, silent, safety checker on); ffmpeg loop blend",
      aiGenerated: true,
    },
  },
  {
    id: "interstellar-frontier",
    styleId: "sci-fi",
    video: "/videos/live-demos/interstellar-frontier.mp4",
    poster: "/videos/live-demos/interstellar-frontier.jpg",
    width: 1280,
    height: 704,
    durationSeconds: 4.3,
    devices: ["desktop"],
    kind: "demo",
    license: "self-authored",
    source: {
      title: "WallHaze original — Interstellar Frontier",
      pageUrl: null,
      author: "WallHaze (self-authored)",
      license: "self-authored",
      licenseUrl: null,
      productionMethod:
        "First frame via fal-ai/flux-2/klein/4b; motion via fal-ai/wan/v2.2-5b/image-to-video (720p, silent, safety checker on); ffmpeg loop blend",
      aiGenerated: true,
    },
  },
  {
    id: "dragon-realm",
    styleId: "dark-fantasy",
    video: "/videos/live-demos/dragon-realm.mp4",
    poster: "/videos/live-demos/dragon-realm.jpg",
    width: 1280,
    height: 704,
    durationSeconds: 4.3,
    devices: ["desktop"],
    kind: "demo",
    license: "self-authored",
    source: {
      title: "WallHaze original — Dragon Realm",
      pageUrl: null,
      author: "WallHaze (self-authored)",
      license: "self-authored",
      licenseUrl: null,
      productionMethod:
        "First frame via fal-ai/flux-2/klein/4b; motion via fal-ai/wan/v2.2-5b/image-to-video (720p, silent, safety checker on); ffmpeg loop blend",
      aiGenerated: true,
    },
  },
];

/**
 * Retired CC0-photo demos (2026-10-24 batch) — kept for the audit trail and
 * their public files; no longer rendered anywhere.
 */
export const ARCHIVED_LIVE_DEMOS = [
  {
    id: "sakura-dream",
    styleId: "cinematic",
    video: "/videos/live-demos/night-sakura.mp4",
    poster: "/videos/live-demos/night-sakura.jpg",
    width: 720,
    height: 1280,
    durationSeconds: 5,
    devices: ["phone"],
    kind: "demo",
    license: "cc0",
    source: {
      title: "Cherry blossom against blue sky (Unsplash)",
      pageUrl:
        "https://commons.wikimedia.org/wiki/File:Cherry_blossom_against_blue_sky_(Unsplash).jpg",
      author: "indah nur indaheart",
      license: "cc0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      productionMethod:
        "CC0 cherry-blossom photo, dusk color grade, slow camera drift and local falling-petal animation",
      aiGenerated: false,
    },
  },
  {
    id: "neon-rain",
    styleId: "cyberpunk",
    video: "/videos/live-demos/neon-rain.mp4",
    poster: "/videos/live-demos/neon-rain.jpg",
    width: 720,
    height: 1280,
    durationSeconds: 5,
    devices: ["phone"],
    kind: "demo",
    license: "cc0",
    source: {
      title: "Hong Kong in the night",
      pageUrl:
        "https://commons.wikimedia.org/wiki/File:Hong_Kong_in_the_night.jpg",
      author: "Wilfredor",
      license: "cc0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      productionMethod:
        "CC0 night photograph, slow push-in and local rain/neon-glint overlay",
      aiGenerated: false,
    },
  },
  {
    id: "star-drift",
    styleId: "starry-galaxy",
    video: "/videos/live-demos/star-drift.mp4",
    poster: "/videos/live-demos/star-drift.jpg",
    width: 1280,
    height: 720,
    durationSeconds: 5,
    devices: ["desktop"],
    kind: "demo",
    license: "cc0",
    source: {
      title: "Carina Nebula in Hubble Palette",
      pageUrl:
        "https://commons.wikimedia.org/wiki/File:Carina_Nebula_in_Hubble_Palette_Rasa_8_ORIGINAL_unsharpened.jpg",
      author: "Dylan O'Donnell",
      license: "cc0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      productionMethod:
        "CC0 astrophotograph, very slow drift/zoom and local twinkling-star/shooting-star overlay",
      aiGenerated: false,
    },
  },
  {
    id: "jellyfish-glow",
    styleId: "deep-ocean",
    video: "/videos/live-demos/jellyfish-glow.mp4",
    poster: "/videos/live-demos/jellyfish-glow.jpg",
    width: 1024,
    height: 1024,
    durationSeconds: 5,
    devices: ["tablet"],
    kind: "demo",
    license: "cc0",
    source: {
      title: "Lion's mane jellyfish in Gullmarn fjord at Sämstad 3",
      pageUrl:
        "https://commons.wikimedia.org/wiki/File:Lion%27s_mane_jellyfish_in_Gullmarn_fjord_at_S%C3%A4mstad_3.jpg",
      author: "W.carter",
      license: "cc0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      productionMethod:
        "CC0 underwater photograph, slow camera drift and local bubbles/soft light pulse overlay",
      aiGenerated: false,
    },
  },
  {
    id: "aurora-veil",
    styleId: "aurora-nights",
    video: "/videos/live-demos/aurora-veil.mp4",
    poster: "/videos/live-demos/aurora-veil.jpg",
    width: 1280,
    height: 720,
    durationSeconds: 5,
    devices: ["desktop"],
    kind: "demo",
    license: "cc0",
    source: {
      title: "Polar lights over dark trees (Unsplash)",
      pageUrl:
        "https://commons.wikimedia.org/wiki/File:Polar_lights_over_dark_trees_(Unsplash).jpg",
      author: "Vincent Guth",
      license: "cc0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      productionMethod:
        "CC0 aurora photograph, slow drift and local soft aurora shimmer/star overlay",
      aiGenerated: false,
    },
  },
  {
    id: "sunset-station",
    styleId: "cinematic",
    video: "/videos/live-demos/sunset-station.mp4",
    poster: "/videos/live-demos/sunset-station.jpg",
    width: 1280,
    height: 720,
    durationSeconds: 5,
    devices: ["desktop"],
    kind: "demo",
    license: "cc0",
    source: {
      title: "Sunset Bruges station",
      pageUrl:
        "https://commons.wikimedia.org/wiki/File:Sunset_Bruges_station.JPG",
      author: "Antonio Borrillo",
      license: "cc0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      productionMethod:
        "CC0 sunset photograph, slow drift and local drifting-leaf/warm-light overlay",
      aiGenerated: false,
    },
  },
  {
    id: "forest-light",
    styleId: "nature",
    video: "/videos/live-demos/forest-light.mp4",
    poster: "/videos/live-demos/forest-light.jpg",
    width: 1280,
    height: 720,
    durationSeconds: 5,
    devices: ["desktop"],
    kind: "demo",
    license: "cc0",
    source: {
      title: "Sunrise breaking into the forest (Unsplash)",
      pageUrl:
        "https://commons.wikimedia.org/wiki/File:Sunrise_breaking_into_the_forest_(Unsplash).jpg",
      author: "Kristine Weilert",
      license: "cc0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      productionMethod:
        "CC0 forest photograph, slow drift and local floating dust/soft light overlay",
      aiGenerated: false,
    },
  },
  {
    id: "flower-field",
    styleId: "photography",
    video: "/videos/live-demos/flower-field.mp4",
    poster: "/videos/live-demos/flower-field.jpg",
    width: 720,
    height: 1280,
    durationSeconds: 5,
    devices: ["phone"],
    kind: "demo",
    license: "cc0",
    source: {
      title: "Poppy field, Oberauroff, detail",
      pageUrl:
        "https://commons.wikimedia.org/wiki/File:Poppy_field,_Oberauroff,_detail.jpg",
      author: "Gerda Arendt",
      license: "cc0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      productionMethod:
        "CC0 poppy-meadow photograph, slow drift and local petal/bokeh overlay",
      aiGenerated: false,
    },
  },
] satisfies readonly LiveDemo[];

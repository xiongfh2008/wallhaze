import type { StyleId } from "@/lib/styles";
import type { DeviceCategory } from "@/lib/media";

/**
 * Eight motion demos, each a licensed CC0 photograph with locally rendered
 * camera drift and rain/petals/stars/bubbles/light overlays, encoded as a
 * real 5-second silent MP4. They are explicitly demos — not AI output — and
 * every source, author and license is recorded here and in
 * docs/codex/MEDIA-SOURCES.md.
 */
export type LiveDemoLicense = "cc0" | "public-domain" | "self-authored";

export interface LiveDemoSource {
  title: string;
  pageUrl: string;
  author: string;
  license: LiveDemoLicense;
  licenseUrl: string | null;
  productionMethod: string;
  aiGenerated: false;
}

export interface LiveDemo {
  id: string;
  styleId: StyleId;
  video: string;
  poster: string;
  width: number;
  height: number;
  durationSeconds: 5;
  devices: DeviceCategory[];
  kind: "demo";
  license: LiveDemoLicense;
  source: LiveDemoSource;
}

export const LIVE_DEMOS: readonly LiveDemo[] = [
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
];

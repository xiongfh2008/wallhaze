import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WallHaze",
    short_name: "WallHaze",
    description: "Free wallpapers for every screen, with AI creation coming soon.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0718",
    theme_color: "#0b0718",
    icons: [
      {
        src: "/wallhaze-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/wallhaze-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/wallhaze-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

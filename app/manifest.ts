import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/shop",
    name: "justurban wears",
    short_name: "justurban",
    description:
      "A Lagos edit of clearly described urban ladies’ wear, with fit, condition, and availability shown up front.",
    lang: "en-NG",
    dir: "ltr",
    start_url: "/shop",
    scope: "/shop",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#fff8f4",
    theme_color: "#dd6042",
    categories: ["shopping", "lifestyle"],
    prefer_related_applications: false,
    launch_handler: {
      client_mode: "navigate-existing",
    },
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Browse the edit",
        short_name: "Shop",
        description: "Open the justurban wears shop.",
        url: "/shop",
      },
      {
        name: "Search the edit",
        short_name: "Search",
        description: "Find a piece by name, size, colour, or condition.",
        url: "/shop/search",
      },
      {
        name: "Saved pieces",
        short_name: "Saved",
        description: "Return to pieces saved on this device.",
        url: "/shop/saved",
      },
      {
        name: "Your bag",
        short_name: "Bag",
        description: "Review the pieces in your bag.",
        url: "/shop/bag",
      },
    ],
  };
}

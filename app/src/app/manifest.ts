import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Concept 5 Projects",
    short_name: "C5 Projects",
    description: "Concept 5 project pipeline — quotes to completion.",
    id: "/board",
    start_url: "/board",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F7F6F3",
    theme_color: "#FFFFFF",
    lang: "en",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Board", url: "/board", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Estimation", url: "/estimation", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Drawings", url: "/drawings", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Meetings", url: "/meetings", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "New project", url: "/projects/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

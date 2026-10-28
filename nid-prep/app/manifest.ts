import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NID Prep Studio",
    short_name: "NID Prep",
    description: "100-day NID DAT preparation",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#d9481c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

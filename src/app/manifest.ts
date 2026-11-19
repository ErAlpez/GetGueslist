import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VenuGuestPass",
    short_name: "VenuGuestPass",
    description: "Manage event registrations, guestlists, tickets, and check-in.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#202824",
    theme_color: "#1f3a2f",
    icons: [
      {
        src: "/venuguestpass-pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/venuguestpass-pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

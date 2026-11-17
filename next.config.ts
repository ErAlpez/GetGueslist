import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep hydration working when the development WebSocket is unavailable.
    reactDebugChannel: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

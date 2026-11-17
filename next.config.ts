import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "192.168.1.6"],
  experimental: {
    // Keep hydration working when the development WebSocket is unavailable.
    reactDebugChannel: false,
  },
  async redirects() {
    return [
      { source: "/login", destination: "/?auth=sign-in", permanent: false },
      { source: "/sign-up", destination: "/?auth=sign-up", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
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

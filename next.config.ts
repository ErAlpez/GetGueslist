import type { NextConfig } from "next";

const certificateAssetFiles = [
  "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
  "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff",
  "./node_modules/@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff",
  "./node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff",
  "./node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff",
  "./node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff",
  "./node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff",
  "./node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-ext-400-normal.woff",
  "./node_modules/@fontsource/noto-sans/files/noto-sans-greek-400-normal.woff",
  "./node_modules/@fontsource/noto-sans/files/noto-sans-greek-ext-400-normal.woff",
  "./node_modules/@fontsource/noto-sans/files/noto-sans-devanagari-400-normal.woff",
  "./src/lib/fonts/Outfit-Regular.ttf",
  "./src/lib/fonts/Outfit-Medium.ttf",
  "./src/lib/fonts/LibreBaskerville-Bold.ttf",
  "./src/lib/fonts/LibreBaskerville-BoldItalic.ttf",
  "./src/lib/fonts/MonteCarlo-Regular.ttf",
  "./src/lib/certificate-frame/top-left.png",
  "./src/lib/certificate-frame/top-right.png",
  "./src/lib/certificate-frame/bottom-left.png",
  "./src/lib/certificate-frame/bottom-right.png",
  "./src/lib/certificate-frame/top-rule.png",
  "./src/lib/certificate-frame/bottom-rule.png",
  "./src/lib/certificate-frame/left-rule.png",
  "./src/lib/certificate-frame/right-rule.png",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "192.168.1.6"],
  experimental: {
    // Keep hydration working when the development WebSocket is unavailable.
    reactDebugChannel: false,
    serverActions: { bodySizeLimit: "3mb" },
  },
  async redirects() {
    return [
      { source: "/login", destination: "/?auth=sign-in", permanent: false },
      { source: "/sign-up", destination: "/?auth=sign-up", permanent: false },
      { source: "/dashboard/guestlist", destination: "/dashboard/attendees", permanent: true },
      { source: "/offline-guestlist.html", destination: "/offline-venuguestpass.html", permanent: true },
      { source: "/offline-guestlist.js", destination: "/offline-venuguestpass.js", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/t/*/certificate": certificateAssetFiles,
    "/api/check-in/validate": certificateAssetFiles,
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

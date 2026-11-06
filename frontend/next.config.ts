import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server serve its JS when the app is opened via the network IP
  // (otherwise the page never hydrates and forms submit as plain GET requests).
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.*.*", "172.*.*.*", "10.*.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
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

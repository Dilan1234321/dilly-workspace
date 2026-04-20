import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next 16 Cache Components — opt in so we can use 'use cache' directives
    // for cohort pages and video lists.
    cacheComponents: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
    ],
  },
};

export default nextConfig;

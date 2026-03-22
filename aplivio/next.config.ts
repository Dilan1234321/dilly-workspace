import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  devIndicators: false,
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;

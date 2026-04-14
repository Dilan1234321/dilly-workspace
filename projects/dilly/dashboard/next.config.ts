import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  transpilePackages: ['@dilly/api'],
  typescript: { ignoreBuildErrors: true },
  turbopack: {
    root: __dirname,
  },
  devIndicators: false,
};

export default nextConfig;

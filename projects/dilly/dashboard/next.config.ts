import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ['@dilly/api'],
  /** CI runs tsc --noEmit separately; skip duplicate type-check in build to avoid .next/types PageProps false positives. */
  typescript: { ignoreBuildErrors: true },
  /** Monorepo: avoid inferring workspace root from a parent lockfile; keeps Turbopack + tsconfig stable. */
  turbopack: {
    root: path.join(__dirname),
  },
  /** Hide the Next.js "Compiling…" dev indicator from the app UI. */
  devIndicators: false,
};

export default nextConfig;

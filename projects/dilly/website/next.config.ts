import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid `output: "export"`: it overwrites `public/index.html` with a shell that only
  // redirects via client RSC payload (blank `/` on static hosting). Serverless Next on Vercel fixes this.
};

export default nextConfig;

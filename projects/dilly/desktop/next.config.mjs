const API_DEST = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

const nextConfig = {
  transpilePackages: [],
  images: { domains: ['logo.clearbit.com'] },
  async rewrites() {
    return [
      {
        source: '/api/proxy/:path*',
        destination: `${API_DEST}/:path*`,
      },
    ];
  },
};
export default nextConfig;

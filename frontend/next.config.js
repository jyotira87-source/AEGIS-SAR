/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // AEGIS API target is configurable so co-located projects on the default
    // port 8000 never collide (e.g. AEGIS_API_URL=http://127.0.0.1:8017 npm run dev).
    const apiTarget = process.env.AEGIS_API_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
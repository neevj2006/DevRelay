import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        destination: `${apiUrl}/api/auth/:path*`,
        source: "/api/auth/:path*",
      },
      {
        destination: `${apiUrl}/:path*`,
        source: "/api/backend/:path*",
      },
    ];
  },
};

export default nextConfig;

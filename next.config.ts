import type { NextConfig } from "next";

const FASTAPI_BASE =
  process.env.NEXT_PUBLIC_FASTAPI_BASE || "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${FASTAPI_BASE}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

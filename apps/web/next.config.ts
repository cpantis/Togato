import type { NextConfig } from "next";

const raw = process.env.API_INTERNAL_URL || "http://localhost:8080";
const API_URL = raw.startsWith("http") ? raw : `https://${raw}`;

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@togato/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;

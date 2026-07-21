import path from "node:path";
import type { NextConfig } from "next";

const apiProxyTarget =
  process.env.API_PROXY_TARGET ??
  (process.env.NODE_ENV === "production"
    ? "https://openseat-api.onrender.com"
    : "http://localhost:4000");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

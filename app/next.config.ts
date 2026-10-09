import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",  // Static export for Amplify Hosting
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Environment variables
  env: {
    NEXT_PUBLIC_APP_VERSION: "1.0.0",
  },
};

export default nextConfig;

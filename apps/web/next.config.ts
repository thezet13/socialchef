import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@socialchef/pro-fonts", "@socialchef/shared"],

  async rewrites() {
    if (isDev) {
      return [
        {
          source: "/api/:path*",
          destination: "http://api:4000/:path*",
        },
        { source: "/uploads/:path*", destination: "http://nginx/uploads/:path*" },
      ];
    }

    return [];
  },

  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "4001",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "api.socialchef.com",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;
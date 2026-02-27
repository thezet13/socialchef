import type { NextConfig } from "next";

//const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4001";
 const API_BASE =
   process.env.NODE_ENV === "development"
     ? (process.env.NEXT_PUBLIC_API_URL ?? "https://app.socialchef.net")
     : "/api";
    
const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  transpilePackages: [
    "@socialchef/pro-fonts",
    "@socialchef/shared",
  ],
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: `${API_BASE}/uploads/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      // DEV API
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "4001",
        pathname: "/uploads/**",
      },

      // PROD API (замени hostname на свой)
      {
        protocol: "https",
        hostname: "api.socialchef.com",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;

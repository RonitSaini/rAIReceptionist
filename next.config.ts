import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's query engine must stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;

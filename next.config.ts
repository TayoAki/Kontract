import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Data is stored in a local JSON file (see src/lib/store.ts), so keep the
  // server long-lived rather than serverless.
  output: "standalone",
};

export default nextConfig;

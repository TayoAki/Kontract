import type { NextConfig } from "next";

// Data lives in local files (src/lib/store.ts, src/lib/sam-bulk.ts), so run
// it as a long-lived server (`npm start`), not serverless.
const nextConfig: NextConfig = {};

export default nextConfig;

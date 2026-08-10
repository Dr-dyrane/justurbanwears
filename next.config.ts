import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext reads Next's deploymentId when it tags client navigation and RSC
  // requests. Reuse Vercel's platform ID so the document pin, client headers,
  // and server compatibility checks all identify the same release.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  experimental: {
    // If a client-side navigation still encounters a missing release asset,
    // recover with one full navigation instead of leaving a partial UI behind.
    appNavFailHandling: true,
  },
};

export default nextConfig;

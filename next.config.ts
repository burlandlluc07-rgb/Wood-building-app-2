import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone — a self-contained server bundle
  // (with only the node_modules it actually needs) that Electron
  // can spawn directly, instead of needing the whole project + npm.
  output: "standalone",
};

export default nextConfig;

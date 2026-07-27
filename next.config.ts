import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Out of the bottom-left corner, where it sits directly on top of the sidebar's
  // collapse/expand control and makes it unclickable in `next dev`.
  devIndicators: { position: "bottom-right" },
  // Keep native / Node-only packages external so the server bundler doesn't try to bundle them.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "@node-rs/argon2",
    "pg",
    "nodemailer",
  ],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

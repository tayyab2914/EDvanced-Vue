import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations must NOT run through a transaction pooler — use the direct/session
    // connection when one is configured.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});

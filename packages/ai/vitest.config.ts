import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: "verbose",
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres:beast@localhost:5544/beast",
    },
  },
});

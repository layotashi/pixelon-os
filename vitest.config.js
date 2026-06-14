import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "js"),
    },
  },
  test: {
    include: ["tests/**/*.test.js"],
    globals: true,
  },
});


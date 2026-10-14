import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests target the framework-agnostic core (store + actions), which needs
 * no DOM. The Pixi/React surfaces are covered by the Playwright e2e smoke test.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@mmx/editor-runtime/adapters": resolve(__dirname, "src/editor-runtime/adapters/index.ts"),
      "@mmx/editor-runtime": resolve(__dirname, "src/editor-runtime/index.ts"),
      "@mmx/project-io/node": resolve(__dirname, "src/project-io/node.ts"),
      "@mmx/project-io": resolve(__dirname, "src/project-io/index.ts"),
      "@mmx/starter-template": resolve(__dirname, "src/starter-template/index.ts"),
    },
  },
  test: {
    include: ["src/renderer/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
  },
});

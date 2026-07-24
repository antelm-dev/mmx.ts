import { defineConfig } from "vitest/config";

/**
 * Unit tests target the framework-agnostic core (store + actions), which needs
 * no DOM. The Pixi/React surfaces are covered by the Playwright e2e smoke test.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

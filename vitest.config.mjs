
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./tests/wrangler.d1-test.jsonc"
      }
    })
  ],

  test: {
    include: [
      "tests/**/*.integration.test.mjs"
    ],
    maxWorkers: 1,
    coverage: {
      provider: "istanbul",
      include: ["worker/**/*.js"],
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage"
    }
  }
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/modules/**", "src/lib/cnj.ts"],
      exclude: ["**/*.test.*", "**/fixtures.ts", "**/example-table.ts"],
      thresholds: {
        "src/modules/quotes/pricing.ts": {
          statements: 96,
          branches: 96,
          functions: 96,
          lines: 96,
        },
      },
    },
  },
});

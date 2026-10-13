import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // Preparo das fixtures e várias transações fazem parte de cada cenário.
    testTimeout: 20000,
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
  },
});

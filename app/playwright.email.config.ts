import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Mesmo Chromium/larguras da suíte principal; HTML local não precisa de app/DB.
export default defineConfig({
  ...base,
  testMatch: ["email-models.spec.ts", "auth-email-models.spec.ts"],
  webServer: undefined,
});

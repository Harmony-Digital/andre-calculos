import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: {
    "/api/processes/*/decisions/pdf": ["./public/pdf-fonts/*.woff"],
    "/api/quotes/*/pdf": ["./public/pdf-fonts/*.woff"],
    "/app/orcamentos/*": ["./public/pdf-fonts/*.woff"],
    "/painel/orcamentos/*": ["./public/pdf-fonts/*.woff"],
    "/api/cron/contract-pdfs": ["./public/pdf-fonts/*.woff"],
  },
  logging: {
    incomingRequests: false,
    serverFunctions: false,
    browserToTerminal: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

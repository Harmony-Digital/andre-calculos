import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => vi.unstubAllEnvs());
describe("saúde da aplicação", () => {
  it("responde com versão e identificação local", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
    vi.stubEnv("VERCEL_REGION", undefined);
    expect(GET().status).toBe(200);
    expect(await GET().json()).toEqual({
      status: "ok",
      version: "0.1.0",
      sha: "local",
      region: "local",
    });
  });
  it("identifica a revisão e a região implantadas", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    vi.stubEnv("VERCEL_REGION", "gru1");
    expect(await GET().json()).toMatchObject({ sha: "abc123", region: "gru1" });
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  includeDeploymentFile,
  deploymentRequest,
} from "./preparar-pacote-vercel.mjs";
test("inclui módulos/fontes/configuração e recusa segredos/testes/cache", () => {
  for (const path of [
    "app/src/app/page.tsx",
    "app/src/fonts/source-serif-4.woff2",
    "app/package-lock.json",
    "app/vercel.json",
    "app/scripts/copy-pdf-assets.mjs",
  ])
    assert.equal(includeDeploymentFile(path), true);
  for (const path of [
    "app/.env.local",
    "app/src/testing/fixture.ts",
    "app/src/lib/testing/fixture.ts",
    "app/src/a.test.ts",
    "app/tests/x.spec.ts",
    "app/.next/x",
    "docs/transcricao.md",
    "app/node_modules/x",
  ])
    assert.equal(includeDeploymentFile(path), false);
});
test("pacote é restrito ao projeto autorizado e registra origem/hash", () => {
  const r = deploymentRequest("a".repeat(40), [
    { file: "src/app/page.tsx", data: "b2s=", encoding: "base64" },
  ]);
  assert.equal(r.requestBody.project, "prj_tdmzmC6utVU2fHPz0iVhroMD8NtI");
  assert.equal(r.requestBody.target, "production");
  assert.equal(r.requestBody.meta.validation_source_sha, "a".repeat(40));
  assert.match(r.requestBody.meta.validation_artifact_sha256, /^[a-f0-9]{64}$/);
});
test("recusa fonte indefinida e conteúdo fora da aplicação", () => {
  assert.throws(() => deploymentRequest("main", []));
  assert.throws(() =>
    deploymentRequest("a".repeat(40), [{ file: ".env.local", data: "x" }]),
  );
});

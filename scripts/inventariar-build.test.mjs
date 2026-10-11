import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { collectBuildInventory } from "./inventariar-build.mjs";

const sourceSha = "a".repeat(40);
const checkoutSha = "b".repeat(40);
const targetPackages = [
  "eslint-config-next",
  "@next/eslint-plugin-next",
  "fast-glob",
  "micromatch",
  "braces",
];
const privateText = "CONTEUDO_PRIVADO_FICTICIO";
async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "andre-build-fixture-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function put(path, content) {
    const full = resolve(root, path);
    await mkdir(resolve(full, ".."), { recursive: true });
    await writeFile(
      full,
      typeof content === "string" ? content : JSON.stringify(content),
    );
  }
  await put(".next/BUILD_ID", privateText);
  await put("next.config.ts", `// ${privateText}`);
  await put("package-lock.json", {
    lockfileVersion: 3,
    packages: Object.fromEntries(
      targetPackages.map((name) => [
        `node_modules/${name}`,
        { version: "3.0.3", dev: true },
      ]),
    ),
  });
  await put("node_modules/braces/index.js", privateText);
  await put(
    ".next/server/main.js",
    `/* node_modules/fast-glob/index.js */ ${privateText}`,
  );
  await put(".next/static/chunks/client.js", `/* ${privateText} */`);
  await put(".next/dev/chunks/private.js", privateText);
  await put(".next/cache/private.js", privateText);
  await put(".next/server/main.js.nft.json", {
    version: 1,
    files: ["../../node_modules/braces/index.js"],
  });
  return {
    root,
    put,
    run: () => collectBuildInventory({ root, sourceSha, checkoutSha }),
  };
}

test("inventário liga produção à fonte/lock e exporta somente metadados determinísticos", async (t) => {
  const f = await fixture(t);
  const result = await f.run();
  assert.deepEqual(await f.run(), result);
  assert.equal(result.sourceSha, sourceSha);
  assert.equal(result.checkoutSha, checkoutSha);
  assert.equal(result.traceCoverageComplete, true);
  assert.equal(result.traces.length, 1);
  assert.equal(result.javascriptOutputs.length, 2);
  assert.equal(
    result.packages.find((p) => p.name === "braces").traceReferences,
    1,
  );
  assert.equal(
    result.packages.find((p) => p.name === "fast-glob").pathMarkerFiles.length,
    1,
  );
  assert.ok(result.packages.every((p) => p.declaredDevelopmentOnly));
  const text = JSON.stringify(result);
  assert.ok(!text.includes(privateText) && !text.includes(f.root));
  assert.ok(!text.includes(".next/dev/") && !text.includes(".next/cache/"));
  assert.match(result.conclusion, /não provam ausência/);
  assert.match(result.lockSha256, /^[a-f0-9]{64}$/);
});

test("extensões NFT incluem raiz adicional e symlink sem perder referências", async (t) => {
  const f = await fixture(t);
  await f.put("node_modules/micromatch/index.js", privateText);
  await symlink("index.js", resolve(f.root, "node_modules/braces/alias.js"));
  await f.put(".next/server/main.js.nft.json", {
    version: 1,
    files: ["../../node_modules/braces/alias.js"],
    fileHashes: ["hash-ficticio"],
    symlinks: [[0, "../../node_modules/braces/index.js", -1]],
    additionalRoots: [
      {
        name: "shared",
        path: "../..",
        files: ["node_modules/micromatch/index.js"],
        fileHashes: ["outro-hash"],
        symlinks: [],
      },
    ],
  });
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, true);
  assert.equal(result.traces[0].entries, 2);
  assert.equal(result.traces[0].additionalRoots, 1);
  assert.equal(
    result.packages.find((p) => p.name === "micromatch").traceReferences,
    1,
  );
  assert.equal(
    result.packages.find((p) => p.name === "braces").traceReferences,
    1,
  );
});

test("extensão desconhecida e referências externas/ausentes deixam cobertura incompleta sem paths privados", async (t) => {
  const f = await fixture(t);
  await f.put(".next/server/main.js.nft.json", {
    version: 1,
    files: [`../../../${privateText}`, "../../node_modules/braces/ausente.js"],
    unknownExtension: privateText,
  });
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, false);
  assert.equal(result.coverage.unknownFields, 1);
  assert.equal(result.coverage.externalReferences, 1);
  assert.equal(result.coverage.missingReferences, 1);
  assert.ok(!JSON.stringify(result).includes(privateText));
});

test("hashes desalinhados, raiz escapada e symlink inválido não produzem relatório", async (t) => {
  const f = await fixture(t);
  for (const nft of [
    { version: 1, files: ["arquivo"], fileHashes: [] },
    { version: 1, files: ["arquivo"], symlinks: [[4, "destino"]] },
    { version: 1, files: ["arquivo"], symlinks: [[0, "destino", 0]] },
    {
      version: 1,
      files: [],
      additionalRoots: [
        { name: "shared", path: "../..", files: ["../fora"], symlinks: [] },
      ],
    },
  ]) {
    await f.put(".next/server/main.js.nft.json", nft);
    await assert.rejects(f.run());
  }
});

test("BUILD_ID ausente e pasta dev ou build parcial não são aceitos como produção", async (t) => {
  const f = await fixture(t);
  await rm(resolve(f.root, ".next/BUILD_ID"));
  await assert.rejects(f.run());
  await f.put(".next/BUILD_ID", "id-antigo");
  await rm(resolve(f.root, ".next/server/main.js.nft.json"));
  await assert.rejects(f.run(), /Build de produção indisponível/);
});

test("symlink de artefato não exporta conteúdo e caminho indireto externo é contado", async (t) => {
  const f = await fixture(t);
  await rm(resolve(f.root, ".next/BUILD_ID"));
  await symlink("../server/main.js", resolve(f.root, ".next/BUILD_ID"));
  await assert.rejects(f.run());
  await rm(resolve(f.root, ".next/BUILD_ID"));
  await f.put(".next/BUILD_ID", "id-build");
  const outside = await mkdtemp(resolve(tmpdir(), "andre-outside-fixture-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(resolve(outside, "index.js"), privateText);
  await rm(resolve(f.root, "node_modules/braces"), { recursive: true });
  await symlink(outside, resolve(f.root, "node_modules/braces"));
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, false);
  assert.equal(result.coverage.externalReferences, 1);
  assert.ok(!JSON.stringify(result).includes(outside));
});

test("identidade ausente ou divergente falha com erro público fixo na CLI", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    collectBuildInventory({
      root: f.root,
      sourceSha: privateText,
      checkoutSha,
    }),
    /Identificação do build inválida/,
  );
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./inventariar-build.mjs", import.meta.url))],
    {
      cwd: f.root,
      encoding: "utf8",
      env: { AUDIT_SOURCE_SHA: sourceSha, AUDIT_CHECKOUT_SHA: checkoutSha },
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Inventário do build indisponível; nenhum conteúdo privado foi exportado.\n",
  );
});

test("CLI confere o checkout real e rejeita fonte que não corresponde à árvore testada", async (t) => {
  const f = await fixture(t);
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
      { cwd: f.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  git("init", "--initial-branch=fixture");
  git("add", "next.config.ts", "package-lock.json");
  git(
    "-c",
    "user.name=Teste fictício",
    "-c",
    "user.email=teste@example.invalid",
    "commit",
    "-m",
    "Fixture fictícia",
  );
  const actual = git("rev-parse", "HEAD").trim();
  const script = fileURLToPath(
    new URL("./inventariar-build.mjs", import.meta.url),
  );
  const good = spawnSync(process.execPath, [script], {
    cwd: f.root,
    encoding: "utf8",
    env: { AUDIT_SOURCE_SHA: actual, AUDIT_CHECKOUT_SHA: actual },
  });
  assert.equal(good.status, 0);
  assert.equal(JSON.parse(good.stdout).checkoutSha, actual);
  for (const env of [
    { AUDIT_SOURCE_SHA: actual, AUDIT_CHECKOUT_SHA: checkoutSha },
    { AUDIT_SOURCE_SHA: sourceSha, AUDIT_CHECKOUT_SHA: actual },
  ]) {
    const bad = spawnSync(process.execPath, [script], {
      cwd: f.root,
      encoding: "utf8",
      env,
    });
    assert.equal(bad.status, 1);
    assert.equal(bad.stdout, "");
    assert.equal(
      bad.stderr,
      "Inventário do build indisponível; nenhum conteúdo privado foi exportado.\n",
    );
  }
  // Falha injetada na API interna: carga continua dentro do catch público.
  const source = await readFile(script, "utf8");
  const unavailableSource = source.replace(
    '"next/dist/build/nft.js"',
    '"next/dist/build/nao-existe-fixture.js"',
  );
  assert.notEqual(unavailableSource, source);
  await f.put("scripts/inventariar-build.mjs", unavailableSource);
  const unavailable = spawnSync(
    process.execPath,
    [resolve(f.root, "scripts/inventariar-build.mjs")],
    {
      cwd: f.root,
      encoding: "utf8",
      env: { AUDIT_SOURCE_SHA: actual, AUDIT_CHECKOUT_SHA: actual },
    },
  );
  assert.equal(unavailable.status, 1);
  assert.equal(unavailable.stdout, "");
  assert.equal(
    unavailable.stderr,
    "Inventário do build indisponível; nenhum conteúdo privado foi exportado.\n",
  );
});

test("alvo declarado externo, ausente ou divergente não afirma cobertura; raiz cruzada válida é conferida", async (t) => {
  const f = await fixture(t);
  for (const target of [
    `../../../${privateText}`,
    "../../node_modules/braces/ausente.js",
    "../../node_modules/braces/index.js",
  ]) {
    await f.put(".next/server/main.js.nft.json", {
      version: 1,
      files: ["../../node_modules/braces/index.js"],
      symlinks: [[0, target]],
    });
    const result = await f.run();
    assert.equal(result.traceCoverageComplete, false);
    assert.ok(result.coverage.unresolvedSymlinks > 0);
    assert.deepEqual(result.diagnostics, [
      {
        reason: "declared_symlink_mismatch",
        tracePath: ".next/server/main.js.nft.json",
        entryIndex: 0,
      },
    ]);
    assert.ok(!JSON.stringify(result).includes(privateText));
  }
  await f.put("node_modules/micromatch/index.js", privateText);
  await symlink(
    "../micromatch/index.js",
    resolve(f.root, "node_modules/braces/cross.js"),
  );
  await f.put(".next/server/main.js.nft.json", {
    version: 1,
    files: ["../../node_modules/braces/cross.js"],
    symlinks: [[0, "node_modules/micromatch/index.js", 0]],
    additionalRoots: [
      {
        name: "shared",
        path: "../..",
        files: ["node_modules/micromatch/index.js"],
        symlinks: [],
      },
    ],
  });
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, true);
  assert.ok(
    result.packages.find((p) => p.name === "micromatch").traceReferences > 0,
  );
});

test("candidato incorporado ao Next não recebe a versão declarada do pacote original", async (t) => {
  const f = await fixture(t);
  await f.put(
    "node_modules/next/dist/compiled/micromatch/index.js",
    privateText,
  );
  await f.put(".next/server/main.js.nft.json", {
    version: 1,
    files: ["../../node_modules/next/dist/compiled/micromatch/index.js"],
  });
  await f.put(
    ".next/server/main.js",
    `/* next/dist/compiled/micromatch/index.js ${privateText} */`,
  );
  const result = await f.run();
  const packageInfo = result.packages.find((p) => p.name === "micromatch");
  assert.equal(packageInfo.traceReferences, 0);
  assert.equal(packageInfo.compiledTraceReferences, 1);
  assert.equal(packageInfo.compiledPathMarkerFiles.length, 1);
  assert.equal(packageInfo.compiledVersion, "indeterminada");
  assert.deepEqual(packageInfo.versions, ["3.0.3"]);
  assert.ok(!JSON.stringify(result).includes(privateText));
});

test("symlink de output informa somente motivo e path relativo, sem seguir arquivo ou diretório", async (t) => {
  const f = await fixture(t);
  const outside = await mkdtemp(resolve(tmpdir(), "andre-link-fixture-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(resolve(outside, `${privateText}.js`), privateText);
  await symlink(
    resolve(outside, `${privateText}.js`),
    resolve(f.root, ".next/server/linked.js"),
  );
  await symlink(outside, resolve(f.root, ".next/server/linked-directory"));
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, false);
  assert.equal(result.coverage.unresolvedSymlinks, 2);
  assert.equal(result.javascriptOutputs.length, 2);
  assert.deepEqual(result.diagnostics, [
    {
      reason: "artifact_symlink_skipped",
      artifactPath: ".next/server/linked-directory",
    },
    {
      reason: "artifact_symlink_skipped",
      artifactPath: ".next/server/linked.js",
    },
  ]);
  const text = JSON.stringify(result);
  assert.ok(!text.includes(outside) && !text.includes(privateText));
});

test("falha de resolução do trace informa posição sem exportar erro ou alvo", async (t) => {
  const f = await fixture(t);
  await symlink("loop.js", resolve(f.root, "node_modules/braces/loop.js"));
  await f.put(".next/server/main.js.nft.json", {
    version: 1,
    files: ["../../node_modules/braces/loop.js"],
  });
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, false);
  assert.equal(result.coverage.unresolvedSymlinks, 1);
  assert.deepEqual(result.diagnostics, [
    {
      reason: "trace_resolution_failed",
      tracePath: ".next/server/main.js.nft.json",
      entryIndex: 0,
      reference: "source",
    },
  ]);
  const text = JSON.stringify(result);
  assert.ok(!text.includes("loop.js") && !text.includes(f.root));
});

test("symlink físico omitido dos metadados tem motivo próprio sem expor o alvo", async (t) => {
  const f = await fixture(t);
  await symlink("index.js", resolve(f.root, "node_modules/braces/alias.js"));
  await f.put(".next/server/main.js.nft.json", {
    version: 1,
    files: ["../../node_modules/braces/alias.js"],
    symlinks: [],
  });
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, false);
  assert.equal(result.coverage.unresolvedSymlinks, 1);
  assert.deepEqual(result.diagnostics, [
    {
      reason: "undeclared_symlink",
      tracePath: ".next/server/main.js.nft.json",
      entryIndex: 0,
    },
  ]);
  assert.ok(!JSON.stringify(result).includes("alias.js"));
});

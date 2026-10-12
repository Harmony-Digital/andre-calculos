import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
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
const alias = ".next/node_modules/@react-pdf/renderer-1234567890abcdef";
const packageRoot = "node_modules/@react-pdf/renderer";
async function externalizedFixture(t) {
  const f = await fixture(t);
  const lock = JSON.parse(
    await readFile(resolve(f.root, "package-lock.json"), "utf8"),
  );
  lock.packages[""] = { dependencies: { "@react-pdf/renderer": "4.9.0" } };
  lock.packages[packageRoot] = {
    version: "4.9.0",
    resolved:
      "https://registry.npmjs.org/@react-pdf/renderer/-/renderer-4.9.0.tgz",
    integrity: "sha512-fixture",
  };
  await f.put("package-lock.json", lock);
  await f.put("package.json", {
    dependencies: { "@react-pdf/renderer": "4.9.0" },
    privateMetadata: privateText,
  });
  await f.put(`${packageRoot}/package.json`, {
    name: "@react-pdf/renderer",
    version: "4.9.0",
    privateMetadata: privateText,
  });
  await f.put(
    `${packageRoot}/lib/main.js`,
    `/* node_modules/braces/index.js next/dist/compiled/micromatch/index.js ${privateText} */`,
  );
  await mkdir(resolve(f.root, alias, ".."), { recursive: true });
  await symlink(resolve(f.root, packageRoot), resolve(f.root, alias));
  return {
    ...f,
    lock,
    run: () =>
      collectBuildInventory({
        root: f.root,
        sourceSha,
        checkoutSha,
        inspectExternalizedDependencies: true,
      }),
  };
}
async function fixture(t) {
  const root = await realpath(
    await mkdtemp(resolve(tmpdir(), "andre-build-fixture-")),
  );
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

test("alias permitido resolve instalação exata e inspeciona JS/CJS/MJS com hashes sem paths físicos", async (t) => {
  const f = await externalizedFixture(t);
  await f.put(`${packageRoot}/lib/module.mjs`, privateText);
  await f.put(`${packageRoot}/lib/common.cjs`, privateText);
  await f.put(`${packageRoot}/lib/main.js.map`, privateText);
  await f.put(`${packageRoot}/README.md`, privateText);
  const result = await f.run();
  assert.deepEqual(await f.run(), result);
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.traceCoverageComplete, true);
  assert.equal(result.externalizedDependencies.length, 1);
  const dependency = result.externalizedDependencies[0];
  assert.equal(dependency.artifactPath, alias);
  assert.equal(dependency.name, "@react-pdf/renderer");
  assert.equal(dependency.version, "4.9.0");
  assert.equal(dependency.inspectionComplete, true);
  assert.equal(dependency.javascriptOutputs.length, 3);
  assert.ok(
    dependency.javascriptOutputs.every(
      (file) =>
        file.artifactPath === alias &&
        Number.isInteger(file.entryIndex) &&
        file.bytes > 0 &&
        /^[0-9a-f]{64}$/.test(file.sha256),
    ),
  );
  assert.equal(
    result.packages.find((p) => p.name === "braces").externalizedPathMarkerFiles
      .length,
    1,
  );
  assert.equal(
    result.packages.find((p) => p.name === "micromatch")
      .compiledExternalizedPathMarkerFiles.length,
    1,
  );
  const text = JSON.stringify(result);
  assert.ok(
    !text.includes(privateText) &&
      !text.includes(f.root) &&
      !text.includes("lib/main.js") &&
      !text.includes("README"),
  );
  assert.match(
    result.conclusion,
    /Metadados de versão não atestam integridade/,
  );
});

test("alvo externo, arquivo privado, diretório do repo e outro pacote são recusados", async (t) => {
  for (const destination of [
    "outside",
    "private-file",
    "repository-directory",
    "other-package",
  ]) {
    const f = await externalizedFixture(t);
    let target;
    if (destination === "outside") {
      target = await mkdtemp(resolve(tmpdir(), "andre-external-fixture-"));
      t.after(() => rm(target, { recursive: true, force: true }));
    } else if (destination === "private-file") {
      await f.put(".env", privateText);
      target = resolve(f.root, ".env");
    } else if (destination === "repository-directory") {
      await f.put("private-directory/package.json", {
        name: "@react-pdf/renderer",
        version: "4.9.0",
      });
      target = resolve(f.root, "private-directory");
    } else {
      await f.put("node_modules/other/package.json", {
        name: "@react-pdf/renderer",
        version: "4.9.0",
      });
      target = resolve(f.root, "node_modules/other");
    }
    await rm(resolve(f.root, alias));
    await symlink(target, resolve(f.root, alias));
    const result = await f.run();
    assert.equal(result.traceCoverageComplete, false);
    assert.deepEqual(result.externalizedDependencies, []);
    assert.deepEqual(result.diagnostics, [
      { reason: "externalized_identity_unconfirmed", artifactPath: alias },
    ]);
    assert.ok(
      !JSON.stringify(result).includes(privateText) &&
        !JSON.stringify(result).includes(target),
    );
  }
});

test("instalação ou ancestral simbólico não se torna permitido por igualdade de realpath", async (t) => {
  for (const location of [packageRoot, "node_modules/@react-pdf"]) {
    const f = await externalizedFixture(t);
    const outside = await mkdtemp(
      resolve(tmpdir(), "andre-installation-fixture-"),
    );
    t.after(() => rm(outside, { recursive: true, force: true }));
    await rm(resolve(f.root, location), { recursive: true });
    await symlink(outside, resolve(f.root, location));
    const result = await f.run();
    assert.equal(result.traceCoverageComplete, false);
    assert.equal(result.externalizedDependencies.length, 0);
    assert.ok(!JSON.stringify(result).includes(outside));
  }
});

test("nome/versão e package.json simbólico, hardlink ou diretório não autorizam leitura", async (t) => {
  for (const kind of [
    "name",
    "version",
    "symlink",
    "hardlink",
    "directory",
    "oversized",
  ]) {
    const f = await externalizedFixture(t),
      path = resolve(f.root, packageRoot, "package.json");
    await rm(path);
    if (kind === "name" || kind === "version")
      await f.put(`${packageRoot}/package.json`, {
        name: kind === "name" ? privateText : "@react-pdf/renderer",
        version: kind === "version" ? "5.0.0" : "4.9.0",
      });
    if (kind === "oversized")
      await f.put(
        `${packageRoot}/package.json`,
        JSON.stringify({
          name: "@react-pdf/renderer",
          version: "4.9.0",
          payload: "x".repeat(128 * 1024),
        }),
      );
    if (kind === "symlink")
      await symlink(resolve(f.root, "package.json"), path);
    if (kind === "hardlink") await link(resolve(f.root, "package.json"), path);
    if (kind === "directory") await mkdir(path);
    const result = await f.run();
    assert.equal(result.traceCoverageComplete, false);
    assert.equal(result.externalizedDependencies.length, 0);
    assert.ok(!JSON.stringify(result).includes(privateText));
  }
});

test("lock/declaração de desenvolvimento, local, link ou identidade incompatível é recusado", async (t) => {
  for (const changed of [
    "dev",
    "link",
    "local",
    "registry",
    "declaration",
    "lock-declaration",
    "missing-integrity",
  ]) {
    const f = await externalizedFixture(t);
    const meta = f.lock.packages[packageRoot];
    if (changed === "dev") meta.dev = true;
    if (changed === "link") meta.link = true;
    if (changed === "local") meta.resolved = "file:private-fixture";
    if (changed === "registry")
      meta.resolved = "https://registry.npmjs.org.example.invalid/private";
    if (changed === "declaration")
      await f.put("package.json", {
        dependencies: { "@react-pdf/renderer": "workspace:*" },
      });
    if (changed === "lock-declaration")
      f.lock.packages[""].dependencies["@react-pdf/renderer"] = "^4.9.0";
    if (changed === "missing-integrity") delete meta.integrity;
    await f.put("package-lock.json", f.lock);
    const result = await f.run();
    assert.equal(result.traceCoverageComplete, false);
    assert.equal(result.externalizedDependencies.length, 0);
  }
});

test("alias quebrado ou encadeado e link válido fora do contexto permanecem incompletos", async (t) => {
  for (const kind of ["broken", "chain", "outside-context"]) {
    const f = await externalizedFixture(t);
    await rm(resolve(f.root, alias));
    if (kind === "broken") await symlink("missing", resolve(f.root, alias));
    if (kind === "chain") {
      const intermediary = resolve(f.root, "intermediary");
      await symlink(resolve(f.root, packageRoot), intermediary);
      await symlink(intermediary, resolve(f.root, alias));
    }
    if (kind === "outside-context")
      await symlink(
        resolve(f.root, packageRoot),
        resolve(f.root, ".next/server/package-link"),
      );
    const result = await f.run();
    assert.equal(result.traceCoverageComplete, false);
    assert.equal(result.externalizedDependencies.length, 0);
    assert.ok(!JSON.stringify(result).includes("intermediary"));
  }
});

test("links internos e ciclos não são seguidos nem exportam alvos/nomes de dependência", async (t) => {
  const f = await externalizedFixture(t);
  await symlink(
    resolve(f.root, ".env"),
    resolve(f.root, packageRoot, "lib/secret.js"),
  );
  await symlink(
    resolve(f.root, packageRoot),
    resolve(f.root, packageRoot, "lib/loop"),
  );
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, false);
  assert.equal(result.coverage.uninspectedExternalizedEntries, 2);
  assert.equal(result.externalizedDependencies[0].inspectionComplete, false);
  assert.equal(result.externalizedDependencies[0].javascriptOutputs.length, 1);
  assert.ok(
    !JSON.stringify(result).includes("secret.js") &&
      !JSON.stringify(result).includes("/loop") &&
      !JSON.stringify(result).includes(".env"),
  );
});

test("arquivos ocultos, env, dependência aninhada e hardlinks conservam lacuna sem conteúdo", async (t) => {
  const f = await externalizedFixture(t);
  await f.put(`${packageRoot}/.env.js`, privateText);
  await f.put(`${packageRoot}/credentials.js`, privateText);
  await f.put(`${packageRoot}/node_modules/private/index.js`, privateText);
  await f.put(`${packageRoot}/lib/original.js`, privateText);
  await link(
    resolve(f.root, packageRoot, "lib/original.js"),
    resolve(f.root, packageRoot, "lib/linked.js"),
  );
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, false);
  assert.equal(result.externalizedDependencies[0].javascriptOutputs.length, 1);
  assert.ok(
    !JSON.stringify(result).includes(privateText) &&
      !JSON.stringify(result).includes(".env") &&
      !JSON.stringify(result).includes("credentials.js") &&
      !JSON.stringify(result).includes("original.js"),
  );
});

test("FIFO não bloqueia ou entra no inventário de JavaScript", async (t) => {
  const f = await externalizedFixture(t);
  execFileSync("mkfifo", [resolve(f.root, packageRoot, "lib/pipe.js")]);
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, false);
  assert.equal(result.externalizedDependencies[0].javascriptOutputs.length, 1);
  assert.ok(
    result.diagnostics.some(
      (d) => d.reason === "externalized_file_unconfirmed",
    ),
  );
});

test("limites de quantidade, tamanho individual, total e profundidade mantêm cobertura incompleta", async (t) => {
  for (const kind of ["count", "individual", "total", "depth"]) {
    const f = await externalizedFixture(t);
    if (kind === "count")
      for (let i = 0; i < 513; i++)
        await f.put(`${packageRoot}/lib/file-${i}.js`, "x");
    if (kind === "individual")
      await f.put(
        `${packageRoot}/lib/large.js`,
        "x".repeat(8 * 1024 * 1024 + 1),
      );
    if (kind === "total")
      for (let i = 0; i < 5; i++)
        await f.put(
          `${packageRoot}/lib/big-${i}.js`,
          "x".repeat(7 * 1024 * 1024),
        );
    if (kind === "depth")
      await f.put(
        `${packageRoot}/${Array(10).fill("deep").join("/")}/entry.js`,
        privateText,
      );
    const result = await f.run();
    assert.equal(result.traceCoverageComplete, false);
    assert.equal(result.externalizedDependencies[0].inspectionComplete, false);
    assert.ok(
      result.diagnostics.some(
        (d) => d.reason === "externalized_limit_exceeded",
      ),
    );
    assert.ok(!JSON.stringify(result).includes(privateText));
  }
});

test("dois aliases diretos recuperam os mesmos hashes sem confundir aceitação da instalação", async (t) => {
  const f = await externalizedFixture(t);
  const second = ".next/node_modules/@react-pdf/renderer-fedcba0987654321";
  await symlink(resolve(f.root, packageRoot), resolve(f.root, second));
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, true);
  assert.equal(result.externalizedDependencies.length, 2);
  assert.equal(
    result.externalizedDependencies[0].javascriptOutputs[0].sha256,
    result.externalizedDependencies[1].javascriptOutputs[0].sha256,
  );
  assert.deepEqual(await f.run(), result);
});

test("alias sem JavaScript admitido não afirma inspeção completa", async (t) => {
  const f = await externalizedFixture(t);
  await rm(resolve(f.root, packageRoot, "lib"), { recursive: true });
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, false);
  assert.equal(result.externalizedDependencies[0].inspectionComplete, false);
  assert.ok(
    result.diagnostics.some(
      (d) => d.reason === "externalized_javascript_absent",
    ),
  );
});

test("inspeção externalizada exige habilitação explícita e conserva recusa por padrão", async (t) => {
  const f = await externalizedFixture(t);
  for (const enabled of [undefined, false, "1"]) {
    const result = await collectBuildInventory({
      root: f.root,
      sourceSha,
      checkoutSha,
      inspectExternalizedDependencies: enabled,
    });
    assert.equal(result.externalizedInspectionEnabled, false);
    assert.equal(result.traceCoverageComplete, false);
    assert.deepEqual(result.externalizedDependencies, []);
    assert.deepEqual(result.diagnostics, [
      { reason: "artifact_symlink_skipped", artifactPath: alias },
    ]);
  }
});

test("alias esperado como diretório comum é recusado sem percorrer seu conteúdo", async (t) => {
  const f = await externalizedFixture(t);
  await rm(resolve(f.root, alias));
  await f.put(`${alias}/secret.js`, privateText);
  const result = await f.run();
  assert.equal(result.traceCoverageComplete, false);
  assert.deepEqual(result.externalizedDependencies, []);
  assert.deepEqual(result.diagnostics, [
    { reason: "externalized_identity_unconfirmed", artifactPath: alias },
  ]);
  assert.ok(!JSON.stringify(result).includes("secret.js"));
});

test("CLI habilita a exceção somente no CI com opção explícita", async (t) => {
  const f = await externalizedFixture(t);
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
      {
        cwd: f.root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  git("init", "--initial-branch=fixture");
  git("add", "next.config.ts", "package-lock.json", "package.json");
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
  for (const [context, expected] of [
    [{}, false],
    [{ GITHUB_ACTIONS: "true" }, false],
    [{ AUDIT_INSPECT_EXTERNALIZED: "1" }, false],
    [{ GITHUB_ACTIONS: "false", AUDIT_INSPECT_EXTERNALIZED: "1" }, false],
    [{ GITHUB_ACTIONS: "true", AUDIT_INSPECT_EXTERNALIZED: "1" }, true],
  ]) {
    const run = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./inventariar-build.mjs", import.meta.url))],
      {
        cwd: f.root,
        encoding: "utf8",
        env: {
          AUDIT_SOURCE_SHA: actual,
          AUDIT_CHECKOUT_SHA: actual,
          ...context,
        },
      },
    );
    assert.equal(run.status, 0);
    const result = JSON.parse(run.stdout);
    assert.equal(result.externalizedInspectionEnabled, expected);
    assert.equal(result.externalizedDependencies.length, expected ? 1 : 0);
    assert.equal(result.traceCoverageComplete, expected);
  }
});

test("aliases compartilham limites de quantidade, entradas e bytes", async (t) => {
  for (const kind of ["aliases", "entries", "bytes"]) {
    const f = await externalizedFixture(t);
    if (kind === "entries")
      for (let i = 0; i < 200; i++)
        await f.put(`${packageRoot}/lib/file-${i}.js`, "x");
    if (kind === "bytes")
      for (let i = 0; i < 2; i++)
        await f.put(
          `${packageRoot}/lib/big-${i}.js`,
          "x".repeat(6 * 1024 * 1024),
        );
    const count = kind === "aliases" ? 8 : 3;
    for (let i = 0; i < count; i++)
      await symlink(
        resolve(f.root, packageRoot),
        resolve(
          f.root,
          `.next/node_modules/@react-pdf/renderer-${i.toString(16).padStart(16, "0")}`,
        ),
      );
    const result = await f.run();
    assert.equal(result.traceCoverageComplete, false);
    assert.ok(result.externalizedDependencies.length <= 4);
    const outputs = result.externalizedDependencies.flatMap(
      (d) => d.javascriptOutputs,
    );
    assert.ok(outputs.length <= 512);
    assert.ok(
      outputs.reduce((total, file) => total + file.bytes, 0) <=
        32 * 1024 * 1024,
    );
    assert.ok(
      result.diagnostics.some((d) =>
        /externalized_(?:alias_)?limit_exceeded/.test(d.reason),
      ),
    );
    if (kind === "aliases")
      assert.equal(
        result.diagnostics.filter(
          (d) => d.reason === "externalized_alias_limit_exceeded",
        ).length,
        1,
      );
  }
});

test("ordem lexical de nomes Unicode independe da colação por locale", async (t) => {
  const f = await externalizedFixture(t);
  await rm(resolve(f.root, packageRoot, "lib"), { recursive: true });
  await f.put(`${packageRoot}/lib/é.js`, "composto");
  await f.put(`${packageRoot}/lib/f.js`, "ascii");
  const result = await f.run();
  assert.deepEqual(
    result.externalizedDependencies[0].javascriptOutputs.map((o) => o.sha256),
    ["ascii", "composto"].map((value) =>
      createHash("sha256").update(value).digest("hex"),
    ),
  );
  assert.deepEqual(await f.run(), result);
});

test("arquivo de identificação especial ou hardlink não passa como build", async (t) => {
  for (const kind of ["fifo", "hardlink"]) {
    const f = await fixture(t),
      path = resolve(f.root, ".next/BUILD_ID");
    await rm(path);
    if (kind === "fifo") execFileSync("mkfifo", [path]);
    else await link(resolve(f.root, "next.config.ts"), path);
    await assert.rejects(f.run(), /Arquivo do inventário inválido/);
  }
});

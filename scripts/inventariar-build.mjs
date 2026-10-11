import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import {
  lstat,
  open,
  opendir,
  readdir,
  readlink,
  realpath,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// API interna conferida na versão fixada Next.js 16.4. Não imprime metadados NFT.
const require = createRequire(new URL("../app/package.json", import.meta.url));
const packages = [
  "eslint-config-next",
  "@next/eslint-plugin-next",
  "fast-glob",
  "micromatch",
  "braces",
];
const sha = /^[a-f0-9]{40}$/;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const inside = (root, path) => {
  const part = relative(root, path);
  return !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`);
};
const publicPath = (root, path) => {
  const part = relative(root, path).split(sep).join("/");
  if (!inside(root, path) || !/^\.next\/[A-Za-z0-9_./@()[\]-]+$/.test(part))
    throw new Error("Caminho do inventário inválido.");
  return part;
};
const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const pathString = (value) =>
  typeof value === "string" && !/[\x00-\x1f\x7f]/.test(value);
async function readArtifact(root, path, maxBytes = 64 * 1024 * 1024) {
  const before = await lstat(path);
  if (
    !inside(root, path) ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size > maxBytes ||
    (await realpath(path)) !== path
  )
    throw new Error("Arquivo do inventário inválido.");
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = await file.stat();
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size > maxBytes ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    )
      throw new Error("Arquivo do inventário inválido.");
    const bytes = await file.readFile();
    const after = await file.stat(),
      current = await lstat(path);
    if (
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      bytes.length > maxBytes ||
      current.dev !== opened.dev ||
      current.ino !== opened.ino ||
      !current.isFile() ||
      (await realpath(path)) !== path
    )
      throw new Error("Arquivo do inventário inválido.");
    return bytes;
  } finally {
    await file.close();
  }
}

function validateList(list) {
  if (
    !record(list) ||
    !Array.isArray(list.files) ||
    !list.files.every(pathString)
  )
    throw new Error("Metadados do inventário inválidos.");
  if (
    list.fileHashes !== undefined &&
    (!Array.isArray(list.fileHashes) ||
      list.fileHashes.length !== list.files.length ||
      !list.fileHashes.every((value) => typeof value === "string"))
  )
    throw new Error("Metadados do inventário inválidos.");
  if (
    list.symlinks !== undefined &&
    (!Array.isArray(list.symlinks) ||
      !list.symlinks.every(
        (link, index) =>
          Array.isArray(link) &&
          [2, 3].includes(link.length) &&
          Number.isInteger(link[0]) &&
          link[0] >= 0 &&
          link[0] < list.files.length &&
          (index === 0 || link[0] > list.symlinks[index - 1][0]) &&
          pathString(link[1]) &&
          (link.length === 2 || Number.isInteger(link[2])),
      ))
  )
    throw new Error("Metadados do inventário inválidos.");
}

/** Somente metadados/hash; nunca retorna conteúdo dos arquivos examinados. */
export async function collectBuildInventory({
  root,
  sourceSha,
  checkoutSha,
  inspectExternalizedDependencies = false,
}) {
  if (!sha.test(sourceSha) || !sha.test(checkoutSha))
    throw new Error("Identificação do build inválida.");
  // Dentro do catch da CLI: pacote/API ausente não imprime stack privado.
  const { mapNftFileEntries } = require("next/dist/build/nft.js");
  const nextVersion = require("next/package.json").version;
  root = await realpath(resolve(root));
  const build = resolve(root, ".next");
  if ((await lstat(build)).isSymbolicLink())
    throw new Error("Build de produção indisponível.");
  const buildId = await readArtifact(root, resolve(build, "BUILD_ID"));
  if (!buildId.length) throw new Error("Build de produção indisponível.");
  const lockBytes = await readArtifact(
    root,
    resolve(root, "package-lock.json"),
  );
  const lock = JSON.parse(lockBytes.toString("utf8"));
  if (!record(lock.packages)) throw new Error("Lock do inventário inválido.");
  const findings = packages.map((name) => {
    const entries = Object.entries(lock.packages).filter(
      ([path]) =>
        path === `node_modules/${name}` ||
        path.endsWith(`/node_modules/${name}`),
    );
    if (
      !entries.length ||
      entries.some(
        ([, meta]) =>
          !record(meta) ||
          !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(meta.version),
      )
    )
      throw new Error("Lock do inventário inválido.");
    return {
      name,
      versions: [...new Set(entries.map(([, meta]) => meta.version))].sort(),
      declaredDevelopmentOnly: entries.every(([, meta]) => meta.dev === true),
      traceReferences: 0,
      traces: new Set(),
      pathMarkerFiles: [],
      compiledTraceReferences: 0,
      compiledTraces: new Set(),
      compiledPathMarkerFiles: [],
      compiledVersion: "indeterminada",
      externalizedPathMarkerFiles: [],
      compiledExternalizedPathMarkerFiles: [],
    };
  });
  const coverage = {
    unknownFields: 0,
    externalReferences: 0,
    missingReferences: 0,
    unresolvedSymlinks: 0,
    uninspectedExternalizedEntries: 0,
  };
  const diagnostics = [];
  function unresolved(reason, context) {
    coverage.unresolvedSymlinks++;
    diagnostics.push({ reason, ...context });
  }
  const externalizedDependencies = [];
  const externalizedBudget = { aliases: 0, entries: 0, bytes: 0 };
  let aliasLimitReported = false;
  const expectedAlias = (path) =>
    /^\.next\/node_modules\/@react-pdf\/renderer-[0-9a-f]{16}$/.test(
      publicPath(root, path),
    );
  // Exceção deliberadamente estreita para o pacote já externalizado em Next.
  // Nunca importar/executar seus metadados; não admitir outros caminhos/links.
  async function inspectExternalized(path) {
    const artifactPath = publicPath(root, path);
    if (inspectExternalizedDependencies !== true) {
      unresolved("artifact_symlink_skipped", { artifactPath });
      return true;
    }
    if (++externalizedBudget.aliases > 4) {
      if (!aliasLimitReported) {
        aliasLimitReported = true;
        unresolved("externalized_alias_limit_exceeded", {
          artifactPath: ".next/node_modules/@react-pdf",
        });
      }
      return true;
    }
    const name = "@react-pdf/renderer",
      installation = resolve(root, "node_modules", name);
    const meta = lock.packages[`node_modules/${name}`];
    let manifestBytes, packageBytes;
    try {
      const target = await realpath(path),
        stat = await lstat(installation);
      if (
        target !== installation ||
        resolve(dirname(path), await readlink(path)) !== installation ||
        !stat.isDirectory() ||
        (await realpath(installation)) !== installation ||
        !record(meta) ||
        meta.link === true ||
        meta.dev === true ||
        !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(meta.version) ||
        typeof meta.resolved !== "string" ||
        !meta.resolved.startsWith("https://registry.npmjs.org/") ||
        typeof meta.integrity !== "string" ||
        !meta.integrity.startsWith("sha512-")
      )
        throw new Error();
      manifestBytes = await readArtifact(
        root,
        resolve(root, "package.json"),
        128 * 1024,
      );
      const manifest = JSON.parse(manifestBytes.toString("utf8"));
      const declaration = manifest.dependencies?.[name];
      if (
        typeof declaration !== "string" ||
        declaration !== meta.version ||
        lock.packages[""]?.dependencies?.[name] !== declaration
      )
        throw new Error();
      const metadataPath = resolve(installation, "package.json");
      if ((await lstat(metadataPath)).size > 128 * 1024) throw new Error();
      packageBytes = await readArtifact(installation, metadataPath, 128 * 1024);
      const identity = JSON.parse(packageBytes.toString("utf8"));
      if (
        !record(identity) ||
        identity.name !== name ||
        identity.version !== meta.version
      )
        throw new Error();
    } catch {
      unresolved("externalized_identity_unconfirmed", { artifactPath });
      return true;
    }
    const output = {
      artifactPath,
      name,
      version: meta.version,
      applicationManifestSha256: hash(manifestBytes),
      packageManifestSha256: hash(packageBytes),
      inspectionComplete: true,
      javascriptOutputs: [],
    };
    externalizedDependencies.push(output);
    let entryIndex = 0;
    const seen = new Set();
    function skipped(reason, index) {
      coverage.uninspectedExternalizedEntries++;
      output.inspectionComplete = false;
      diagnostics.push({
        reason,
        artifactPath,
        ...(index === undefined ? {} : { entryIndex: index }),
      });
    }
    async function inspect(directory, depth = 0) {
      if (depth > 8) {
        skipped("externalized_limit_exceeded");
        return;
      }
      const info = await lstat(directory);
      const key = `${info.dev}:${info.ino}`;
      if (
        !info.isDirectory() ||
        (await realpath(directory)) !== directory ||
        seen.has(key)
      ) {
        skipped("externalized_directory_unconfirmed");
        return;
      }
      seen.add(key);
      const entries = [];
      for await (const entry of await opendir(directory)) {
        entries.push(entry);
        if (entries.length + externalizedBudget.entries > 512) {
          skipped("externalized_limit_exceeded");
          return;
        }
      }
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const entry of entries) {
        const index = entryIndex++;
        if (++externalizedBudget.entries > 512) {
          skipped("externalized_limit_exceeded");
          return;
        }
        if (
          /^(?:\.|(?:env|credentials?|secrets?|certificates?|keys?)(?:[._-]|$))/i.test(
            entry.name,
          ) ||
          ["node_modules", "test", "tests", "fixtures", "docs"].includes(
            entry.name.toLowerCase(),
          )
        ) {
          skipped("externalized_entry_excluded", index);
          continue;
        }
        const child = resolve(directory, entry.name);
        if (entry.isSymbolicLink()) {
          skipped("externalized_symlink_skipped", index);
          continue;
        }
        if (entry.isDirectory()) {
          await inspect(child, depth + 1);
          continue;
        }
        if (!entry.isFile()) {
          skipped("externalized_file_unconfirmed", index);
          continue;
        }
        if (!/\.(?:js|mjs|cjs)$/.test(entry.name)) continue;
        const stat = await lstat(child);
        if (!stat.isFile() || stat.nlink !== 1) {
          skipped("externalized_file_unconfirmed", index);
          continue;
        }
        if (
          stat.size > 8 * 1024 * 1024 ||
          externalizedBudget.bytes + stat.size > 32 * 1024 * 1024
        ) {
          skipped("externalized_limit_exceeded", index);
          continue;
        }
        let bytes;
        try {
          bytes = await readArtifact(
            installation,
            child,
            Math.min(
              8 * 1024 * 1024,
              32 * 1024 * 1024 - externalizedBudget.bytes,
            ),
          );
        } catch {
          skipped("externalized_file_unconfirmed", index);
          continue;
        }
        if (externalizedBudget.bytes + bytes.length > 32 * 1024 * 1024) {
          skipped("externalized_limit_exceeded", index);
          continue;
        }
        externalizedBudget.bytes += bytes.length;
        const text = bytes.toString("utf8").replaceAll("\\/", "/");
        const context = { artifactPath, entryIndex: index };
        for (const finding of findings) {
          if (text.includes(`node_modules/${finding.name}/`))
            finding.externalizedPathMarkerFiles.push(context);
          if (text.includes(`next/dist/compiled/${finding.name}/`))
            finding.compiledExternalizedPathMarkerFiles.push(context);
        }
        output.javascriptOutputs.push({
          ...context,
          bytes: bytes.length,
          sha256: hash(bytes),
        });
      }
    }
    try {
      await inspect(installation);
      if (!output.javascriptOutputs.length)
        skipped("externalized_javascript_absent");
      // CI imóvel é requisito; esta conferência não elimina corrida adversarial.
      if (
        (await realpath(path)) !== installation ||
        hash(
          await readArtifact(
            installation,
            resolve(installation, "package.json"),
            128 * 1024,
          ),
        ) !== output.packageManifestSha256
      )
        skipped("externalized_identity_changed");
    } catch {
      skipped("externalized_inspection_failed");
    }
    return true;
  }
  async function resolveReference(path, context) {
    if (!inside(root, path)) {
      coverage.externalReferences++;
      return { path, known: false, symlink: false };
    }
    try {
      const stat = await lstat(path);
      const resolved = await realpath(path);
      if (!inside(root, resolved)) {
        coverage.externalReferences++;
        return { path: resolved, known: false, symlink: stat.isSymbolicLink() };
      }
      return { path: resolved, known: true, symlink: stat.isSymbolicLink() };
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code))
        coverage.missingReferences++;
      else unresolved("trace_resolution_failed", context);
      return { path, known: false, symlink: false };
    }
  }
  const files = [];
  async function walk(directory) {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const path = resolve(directory, entry.name);
      const first = relative(build, path).split(sep)[0];
      if (["dev", "cache", "build", "types", "standalone"].includes(first))
        continue;
      if (expectedAlias(path)) {
        await inspectExternalized(path);
        continue;
      }
      if (entry.isSymbolicLink()) {
        unresolved("artifact_symlink_skipped", {
          artifactPath: publicPath(root, path),
        });
        continue;
      }
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(build);
  const traces = files.filter((path) => path.endsWith(".nft.json"));
  const bundles = files.filter(
    (path) =>
      path.endsWith(".js") &&
      ["server", "static"].includes(relative(build, path).split(sep)[0]),
  );
  if (!traces.length || !bundles.length)
    throw new Error("Build de produção indisponível.");
  const traceMetadata = [];
  for (const path of traces.sort()) {
    const bytes = await readArtifact(root, path);
    const nft = JSON.parse(bytes.toString("utf8"));
    validateList(nft);
    if (
      nft.version !== 1 ||
      (nft.additionalRoots !== undefined && !Array.isArray(nft.additionalRoots))
    )
      throw new Error("Metadados do inventário inválidos.");
    const roots = nft.additionalRoots ?? [];
    if (new Set(roots.map((extra) => extra.name)).size !== roots.length)
      throw new Error("Metadados do inventário inválidos.");
    for (const extra of roots) {
      validateList(extra);
      if (
        !pathString(extra.path) ||
        !/^[A-Za-z0-9_-]+$/.test(extra.name) ||
        !Array.isArray(extra.symlinks)
      )
        throw new Error("Metadados do inventário inválidos.");
      coverage.unknownFields += Object.keys(extra).filter(
        (key) =>
          !["name", "path", "files", "fileHashes", "symlinks"].includes(key),
      ).length;
    }
    for (const list of [nft, ...roots])
      for (const link of list.symlinks ?? [])
        if (link.length === 3 && (link[2] < -1 || link[2] >= roots.length))
          throw new Error("Metadados do inventário inválidos.");
    coverage.unknownFields += Object.keys(nft).filter(
      (key) =>
        ![
          "version",
          "files",
          "fileHashes",
          "symlinks",
          "entryHash",
          "additionalRoots",
        ].includes(key),
    ).length;
    const entries = mapNftFileEntries(nft, path, root);
    // Mesma ordem do mapper: principal seguida das raízes adicionais.
    const targets = [nft, ...roots].flatMap((list, listIndex) => {
      const links = new Map(
        (list.symlinks ?? []).map((link) => [link[0], link]),
      );
      return list.files.map((_, index) => {
        const link = links.get(index);
        if (!link) return { path: null, declared: list.symlinks !== undefined };
        const targetRoot = link[2] ?? listIndex - 1;
        const base =
          targetRoot === -1
            ? dirname(path)
            : resolve(dirname(path), roots[targetRoot].path);
        return { path: resolve(base, link[1]), declared: true };
      });
    });
    const name = publicPath(root, path);
    for (const [index, entry] of entries.entries()) {
      const context = { tracePath: name, entryIndex: index };
      const actual = await resolveReference(entry.source, {
        ...context,
        reference: "source",
      });
      const candidates = [entry.source, actual.path];
      const target = targets[index];
      if (target.path) {
        const declared = await resolveReference(target.path, {
          ...context,
          reference: "declared_target",
        });
        candidates.push(target.path, declared.path);
        if (
          !actual.symlink ||
          !actual.known ||
          !declared.known ||
          actual.path !== declared.path
        )
          unresolved("declared_symlink_mismatch", context);
      } else if (target.declared && actual.symlink) {
        unresolved("undeclared_symlink", context);
      }
      const paths = candidates.map((value) => value.split(sep).join("/"));
      for (const finding of findings)
        if (
          paths.some(
            (normalized) =>
              normalized.includes(`/node_modules/${finding.name}/`) ||
              normalized.endsWith(`/node_modules/${finding.name}`),
          )
        ) {
          finding.traceReferences++;
          finding.traces.add(name);
        }
      for (const finding of findings)
        if (
          paths.some((normalized) =>
            normalized.includes(`/next/dist/compiled/${finding.name}/`),
          )
        ) {
          finding.compiledTraceReferences++;
          finding.compiledTraces.add(name);
        }
    }
    traceMetadata.push({
      path: name,
      sha256: hash(bytes),
      entries: entries.length,
      additionalRoots: roots.length,
    });
  }
  const outputs = [];
  for (const path of bundles.sort()) {
    const bytes = await readArtifact(root, path);
    const name = publicPath(root, path);
    const text = bytes.toString("utf8").replaceAll("\\/", "/");
    for (const finding of findings)
      if (text.includes(`node_modules/${finding.name}/`))
        finding.pathMarkerFiles.push(name);
    for (const finding of findings)
      if (text.includes(`next/dist/compiled/${finding.name}/`))
        finding.compiledPathMarkerFiles.push(name);
    outputs.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
  }
  const configBytes = await readArtifact(root, resolve(root, "next.config.ts"));
  return {
    schemaVersion: 2,
    sourceSha,
    checkoutSha,
    nextVersion,
    nodeVersion: process.version,
    lockSha256: hash(lockBytes),
    configSha256: hash(configBytes),
    buildIdSha256: hash(buildId),
    traceCoverageComplete: Object.values(coverage).every(
      (count) => count === 0,
    ),
    coverage,
    diagnostics,
    traces: traceMetadata,
    javascriptOutputs: outputs,
    externalizedDependencies,
    externalizedInspectionEnabled: inspectExternalizedDependencies === true,
    packages: findings.map((finding) => ({
      ...finding,
      traces: [...finding.traces].sort(),
      compiledTraces: [...finding.compiledTraces].sort(),
    })),
    conclusion:
      "Referências identificáveis no build do CI e JavaScript da dependência externalizada admitida. Metadados de versão não atestam integridade dos bytes; exige árvore estável após npm ci/build. Marcadores ausentes não provam ausência de código minificado; não atesta equivalência à Vercel ou explorabilidade. Advisory permanece aberto.",
  };
}

const entrypoint = process.argv[1]
  ? await realpath(resolve(process.argv[1])).catch(() => null)
  : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  try {
    const root = process.cwd();
    const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (checkoutSha !== process.env.AUDIT_CHECKOUT_SHA) throw new Error();
    const sourceSha = process.env.AUDIT_SOURCE_SHA;
    const header = execFileSync("git", ["cat-file", "-p", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).split("\n\n", 1)[0];
    if (
      sourceSha !== checkoutSha &&
      !header.split("\n").includes(`parent ${sourceSha}`)
    )
      throw new Error();
    const result = await collectBuildInventory({
      root,
      checkoutSha,
      sourceSha,
      inspectExternalizedDependencies:
        process.env.GITHUB_ACTIONS === "true" &&
        process.env.AUDIT_INSPECT_EXTERNALIZED === "1",
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch {
    process.stderr.write(
      "Inventário do build indisponível; nenhum conteúdo privado foi exportado.\n",
    );
    process.exitCode = 1;
  }
}

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
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
async function readArtifact(root, path) {
  if (
    !inside(root, path) ||
    (await lstat(path)).isSymbolicLink() ||
    !inside(root, await realpath(path))
  )
    throw new Error("Arquivo do inventário inválido.");
  return readFile(path);
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
export async function collectBuildInventory({ root, sourceSha, checkoutSha }) {
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
    };
  });
  const coverage = {
    unknownFields: 0,
    externalReferences: 0,
    missingReferences: 0,
    unresolvedSymlinks: 0,
  };
  async function resolveReference(path) {
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
      else coverage.unresolvedSymlinks++;
      return { path, known: false, symlink: false };
    }
  }
  const files = [];
  async function walk(directory) {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(directory, entry.name);
      const first = relative(build, path).split(sep)[0];
      if (["dev", "cache", "build", "types", "standalone"].includes(first))
        continue;
      if (entry.isSymbolicLink()) {
        coverage.unresolvedSymlinks++;
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
      const actual = await resolveReference(entry.source);
      const candidates = [entry.source, actual.path];
      const target = targets[index];
      if (target.path) {
        const declared = await resolveReference(target.path);
        candidates.push(target.path, declared.path);
        if (
          !actual.symlink ||
          !actual.known ||
          !declared.known ||
          actual.path !== declared.path
        )
          coverage.unresolvedSymlinks++;
      } else if (target.declared && actual.symlink) {
        coverage.unresolvedSymlinks++;
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
    schemaVersion: 1,
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
    traces: traceMetadata,
    javascriptOutputs: outputs,
    packages: findings.map((finding) => ({
      ...finding,
      traces: [...finding.traces].sort(),
      compiledTraces: [...finding.compiledTraces].sort(),
    })),
    conclusion:
      "Referências identificáveis no build do CI. Marcadores ausentes não provam ausência de código minificado; não atesta equivalência à Vercel ou explorabilidade. Advisory permanece aberto.",
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
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch {
    process.stderr.write(
      "Inventário do build indisponível; nenhum conteúdo privado foi exportado.\n",
    );
    process.exitCode = 1;
  }
}

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const project = {
  name: "andre-calculos",
  teamId: "team_4fdLDCsB0ROvP5ph50aFNvxm",
  projectId: "prj_tdmzmC6utVU2fHPz0iVhroMD8NtI",
};
export function includeDeploymentFile(path) {
  if (
    !path.startsWith("app/") ||
    /(^|\/)(\.env[^/]*|\.git|\.data|node_modules|test-results|testing)(\/|$)/.test(
      path,
    ) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)
  )
    return false;
  const name = path.slice(4);
  return (
    name.startsWith("src/") ||
    [
      "package.json",
      "package-lock.json",
      "next.config.ts",
      "tsconfig.json",
      "vercel.json",
      "scripts/copy-pdf-assets.mjs",
    ].includes(name)
  );
}
export function deploymentRequest(source, files) {
  if (
    !/^[a-f0-9]{40}$/.test(source) ||
    !files.length ||
    files.some((f) => !includeDeploymentFile("app/" + f.file))
  )
    throw new Error("Fonte ou arquivo fora do pacote permitido.");
  const hash = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  return {
    teamId: project.teamId,
    requestBody: {
      name: project.name,
      project: project.projectId,
      target: "production",
      files,
      meta: { validation_source_sha: source, validation_artifact_sha256: hash },
      projectSettings: { serverlessFunctionRegion: "gru1" },
    },
    forceNew: "1",
  };
}
function main() {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url))),
    source = process.argv[2],
    output = resolve(root, process.argv[3] ?? ".data/publicacao-validacao");
  const inside = relative(resolve(root, ".data"), output);
  if (
    !source ||
    !/^[a-f0-9]{40}$/.test(source) ||
    !inside ||
    inside.startsWith("..") ||
    isAbsolute(inside)
  )
    throw new Error("Informe SHA completo e diretório novo dentro de .data/.");
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, maxBuffer: 10000000 });
  // Publicação só de um commit que já pertence à main local. Conferir a main remota novamente antes do MCP.
  git("merge-base", "--is-ancestor", source, "main");
  const entries = git("ls-tree", "-rz", source, "--", "app")
    .toString()
    .split("\0")
    .filter(Boolean);
  const files = [],
    manifest = [];
  for (const entry of entries) {
    const match = /^(\d+) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    if (!match || !includeDeploymentFile(match[3])) continue;
    if (!["100644", "100755"].includes(match[1]))
      throw new Error("Tipo de arquivo não permitido.");
    const bytes = git("cat-file", "blob", match[2]),
      file = match[3].slice(4);
    files.push({ file, data: bytes.toString("base64"), encoding: "base64" });
    manifest.push({
      file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const request = deploymentRequest(source, files);
  mkdirSync(output, { recursive: true });
  writeFileSync(
    resolve(output, "deployment-mcp.json"),
    JSON.stringify(request),
  );
  writeFileSync(
    resolve(output, "manifest.json"),
    JSON.stringify(
      {
        source,
        project,
        files: manifest,
        artifactSha256: request.requestBody.meta.validation_artifact_sha256,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      source,
      files: files.length,
      bytes: manifest.reduce((sum, f) => sum + f.bytes, 0),
      directory: relative(root, output),
    }),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();

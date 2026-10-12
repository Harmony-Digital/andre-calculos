import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  authEmailManifest,
  prepareAuthEmailTemplates,
} from "../src/modules/notifications/auth-email-templates";

async function main() {
  const templates = await prepareAuthEmailTemplates();
  const script = await realpath(process.argv[1]);
  const directory = resolve(dirname(script), "../../supabase/templates/auth");
  await mkdir(directory, { recursive: true });
  for (const template of templates)
    await writeFile(resolve(directory, template.htmlFile), template.html);
  await writeFile(
    resolve(directory, "manifest.json"),
    `${JSON.stringify(authEmailManifest(templates), null, 2)}\n`,
  );
  process.stdout.write("Três modelos fictícios de autenticação preparados.\n");
}
void main().catch(() => {
  process.stderr.write("Não foi possível preparar os modelos locais.\n");
  process.exitCode = 1;
});

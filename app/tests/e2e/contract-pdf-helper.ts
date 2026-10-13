import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { acceptanceFixture } from "./acceptance-helper";
import { quoteSession } from "./quote-helper";
import { localNotificationSql as sql } from "./notification-helper";
import { localSystem } from "./local-helper";
import { quoteFixturesEnabled } from "../../src/modules/quotes/local-fixtures";
import {
  contractArchiveSchema,
  type ContractArchive,
} from "../../src/modules/quotes/contract-snapshot";
import {
  renderContractPdf,
  contractPdfRendererVersion,
} from "../../src/modules/quotes/contract-pdf";
import {
  independentCleanup,
  type CleanupStep,
} from "../../src/lib/testing/independent-cleanup";

export async function createContractPdfEvidence(label: string) {
  let stage = "initialization";
  if (!quoteFixturesEnabled(process.env))
    throw new Error("Ensaio exclusivo do projeto local fictício.");
  localSystem();
  if (!/^[a-z0-9-]{1,80}$/.test(label))
    throw new Error("Pasta de evidência inválida.");
  const output = resolve(process.cwd(), "../.data/revisao", label);
  for (const file of [
    "normal.pdf",
    "empresa-longa.pdf",
    "legado.pdf",
    "manifest.json",
  ])
    if (existsSync(join(output, file)))
      throw new Error("Evidência anterior preservada; escolha outra pasta.");
  await mkdir(output, { recursive: true });
  const resources: CleanupStep[] = [];
  let failed = false;
  try {
    const fixture = await acceptanceFixture();
    resources.push({ name: "fixture", run: fixture.cleanup });
    const client = await quoteSession();
    resources.unshift({
      name: "session",
      run: async () => {
        if ((await client.auth.signOut({ scope: "local" })).error)
          throw new Error("Sessão fictícia não encerrada.");
      },
    });
    const originalProfile = (
      await fixture.db
        .from("profiles")
        .select("full_name,phone,oab_number,oab_state")
        .eq("id", fixture.owner.owner_id)
        .single()
    ).data!;
    const originalClient = (
      await fixture.db
        .from("clients")
        .select("kind,document,legal_name")
        .eq("id", fixture.owner.id)
        .single()
    ).data!;
    if (!originalProfile || !originalClient)
      throw new Error("Cadastros fictícios não conferidos.");
    resources.unshift({
      name: "profile",
      run: async () => {
        if (
          (
            await fixture.db
              .from("profiles")
              .update(originalProfile)
              .eq("id", fixture.owner.owner_id)
          ).error
        )
          throw new Error("Perfil fictício não restaurado.");
      },
    });
    resources.unshift({
      name: "client",
      run: async () => {
        if (
          (
            await fixture.db
              .from("clients")
              .update(originalClient)
              .eq("id", fixture.owner.id)
          ).error
        )
          throw new Error("Cliente fictício não restaurado.");
      },
    });
    const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    const sha = (data: Buffer) =>
      createHash("sha256").update(data).digest("hex");
    const evidence: {
      file: string;
      sha256: string;
      size: number;
      archive: ContractArchive;
      repeatedBytesEqual: boolean;
    }[] = [];
    const get = async (id: string) => {
      const result = await client.rpc("get_quote_contract_snapshot", {
        target_quote: id,
      });
      if (result.error) throw new Error("Archive fictício indisponível.");
      return contractArchiveSchema.parse(result.data);
    };
    const save = async (file: string, data: ContractArchive) => {
      const first = await renderContractPdf(data),
        second = await renderContractPdf(structuredClone(data));
      if (sha(first) !== sha(second))
        throw new Error("Renderização não determinística.");
      await writeFile(join(output, file), first, { flag: "wx" });
      evidence.push({
        file,
        sha256: sha(first),
        size: first.length,
        archive: data,
        repeatedBytesEqual: true,
      });
      return first;
    };
    stage = "normal";
    if (
      (
        await fixture.db
          .from("profiles")
          .update({
            full_name: "Advogada fictícia de demonstração",
            phone: "11999990000",
            oab_number: "12345",
            oab_state: "SP",
          })
          .eq("id", fixture.owner.owner_id)
      ).error
    )
      throw new Error("Perfil fictício não preparado.");
    if (
      (
        await fixture.db
          .from("clients")
          .update({
            kind: "person",
            document: "52998224725",
            legal_name: "Advogada fictícia de demonstração",
          })
          .eq("id", fixture.owner.id)
      ).error
    )
      throw new Error("Cliente fictício não preparado.");
    const normal = await fixture.create();
    if ((await fixture.db.rpc("accept_quote_system", normal.args())).error)
      throw new Error("Aceite fictício indisponível.");
    const original = await get(normal.id),
      normalBytes = await save("normal.pdf", original);

    if (
      (
        await fixture.db
          .from("profiles")
          .update({ full_name: "Usuária fictícia do escritório" })
          .eq("id", fixture.owner.owner_id)
      ).error
    )
      throw new Error("Usuária fictícia não preparada.");
    if (
      (
        await fixture.db
          .from("clients")
          .update({
            kind: "company",
            document: "11222333000181",
            legal_name: "Escritório fictício de demonstração",
          })
          .eq("id", fixture.owner.id)
      ).error
    )
      throw new Error("Empresa fictícia não preparada.");
    stage = "company";
    const company = await fixture.create({ context: false });
    if (
      (
        await fixture.db
          .from("settings")
          .update({ technical_name: "R".repeat(200) })
          .eq("singleton", true)
      ).error
    )
      throw new Error("Nome extenso fictício não preparado.");
    const settings = (
      await fixture.db
        .from("settings")
        .select("revision,technical_name")
        .eq("singleton", true)
        .single()
    ).data!;
    const proposal = {
      ...company.proposal,
      settingsRevision: settings.revision,
      professional: {
        ...company.proposal.professional,
        name: settings.technical_name!,
      },
    };
    const token = "IDENTIFICADOR_FICTICIO_".repeat(20);
    const longText = (kind: string) => {
      const prefix = `CONTEÚDO SINTÉTICO SEM VIGÊNCIA. INÍCIO ${kind}.\n`;
      const end = `\n${token}\nFIM ${kind}.`;
      return (
        prefix +
        "Parágrafo fictício para conferir preservação do texto, quebra de página e leitura do contrato. Não é uma condição comercial aprovada.\n"
          .repeat(600)
          .slice(0, 64000 - prefix.length - end.length) +
        end
      );
    };
    const terms = longText("TERMOS EXTENSOS"),
      privacy = longText("PRIVACIDADE EXTENSA");
    sql(`insert into private.quote_contract_contexts(quote_id,proposal,terms_version,terms_text,privacy_version,privacy_text,prepared_by)
    values('${company.id}',${literal(JSON.stringify(proposal))}::jsonb,${literal(fixture.terms)},${literal(terms)},${literal(fixture.privacy)},${literal(privacy)},'${fixture.calculator.id}');`);
    const contextHash = sql(
      `select context_hash from private.quote_contract_contexts where quote_id='${company.id}';`,
    );
    if (
      (
        await fixture.db.rpc(
          "accept_quote_system",
          company.args({ expected_context: contextHash }),
        )
      ).error
    )
      throw new Error("Aceite extenso fictício indisponível.");
    stage = "long-render";
    await save("empresa-longa.pdf", await get(company.id));
    if (sha(await renderContractPdf(await get(normal.id))) !== sha(normalBytes))
      throw new Error("Edição posterior alterou o documento original.");
    // Somente amostra local: reproduz recibo anterior à captura de identificação.
    sql(
      `delete from private.quote_contract_snapshots where quote_id='${normal.id}'; select private.freeze_quote_contract('${normal.id}',true);`,
    );
    stage = "legacy-render";
    await save("legado.pdf", await get(normal.id));
    await writeFile(
      join(output, "manifest.json"),
      JSON.stringify(
        {
          rendererVersion: contractPdfRendererVersion,
          examples: evidence,
          normalAfterIdentitySettingsEditsBytesEqual: true,
          longToken: token,
          allDataFictitious: true,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        examples: evidence.map((x) => ({
          file: x.file,
          bytes: x.size,
          sha256: x.sha256,
        })),
        repeatedBytesEqual: true,
      }),
    );
  } catch (error) {
    console.info(
      JSON.stringify({ diagnostic: "contract_pdf_evidence_failed", stage }),
    );
    failed = true;
    throw error;
  } finally {
    await independentCleanup(resources, failed, (resources) =>
      console.warn(
        JSON.stringify({
          diagnostic: "contract_pdf_cleanup",
          failed: resources,
        }),
      ),
    );
  }
}

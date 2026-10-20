import { evaluateProposal } from "../src/modules/quotes/proposal";
import { quoteFixtureInputs } from "../src/modules/quotes/local-fixtures";
import { examplePriceTable } from "../src/modules/quotes/example-table";
import { fictionalChecklist } from "../src/modules/checklist/fixtures";
import { contractArchiveSchema } from "../src/modules/quotes/contract-snapshot";

/** Apenas fixture unitária; não é recibo do banco nem autorização comercial. */
export function contractPdfFixture() {
  const now = new Date("2026-10-13T15:00:00.000Z");
  const answers = {
    ...fictionalChecklist,
    noticeDate: "2026-10-13",
    actType: "other",
    deadlineDays: 60,
    timecardFormat: "image",
    timecardMonths: 7,
    claimants: 2,
    urgency: true,
  } as const;
  const inputs = quoteFixtureInputs(now, answers);
  const result = evaluateProposal({
    now,
    mode: "commercial",
    orderId: "11111111-1111-4111-8111-111111111111",
    processId: "22222222-2222-4222-8222-222222222222",
    checklistRevision: 9,
    settingsRevision: 1,
    validityDays: 7,
    slackDays: 2,
    answers,
    professional: {
      name: "Responsável fictício",
      crcNumber: "000001/O-0",
      crcState: "DF",
      category: "Contador",
      email: "calculista@exemplo.com",
      phone: "+5561999999999",
    },
    conditions: "Condições fictícias sem cobrança.",
    prices: {
      id: "33333333-3333-4333-8333-333333333333",
      active: true,
      activatedAt: now.toISOString(),
      table: { ...examplePriceTable, version: "1", isExample: false },
    },
    calendar: inputs.calendar && { ...inputs.calendar, basis: "reviewed" },
    capacity: inputs.capacity && { ...inputs.capacity, basis: "reviewed" },
    period: inputs.period && { ...inputs.period, basis: "reviewed" },
  });
  if (result.status !== "commercial_ready")
    throw new Error(
      `Fixture unitária indisponível: ${result.status === "blocked" ? result.reasons.join(", ") : result.status}.`,
    );
  const actor = "44444444-4444-4444-8444-444444444444";
  return contractArchiveSchema.parse({
    snapshotHash: "f".repeat(64),
    snapshot: {
      schemaVersion: 1,
      quoteId: "55555555-5555-4555-8555-555555555555",
      number: "ORC-2026-0001",
      proposal: result.proposal,
      contractant: {
        source: "acceptance",
        actorId: actor,
        kind: "person",
        fullName: "Advogada fictícia",
        legalName: "Advogada fictícia",
        document: "52998224725",
        email: "advogada@exemplo.com",
        phone: null,
        oabNumber: null,
        oabState: null,
      },
      terms: {
        version: "teste-termos-v1",
        text: "CONTEÚDO SINTÉTICO SEM VIGÊNCIA. Termos fictícios.",
        sha256: "a".repeat(64),
      },
      privacy: {
        version: "teste-privacidade-v1",
        text: "CONTEÚDO SINTÉTICO SEM VIGÊNCIA. Privacidade fictícia.",
        sha256: "b".repeat(64),
      },
      acceptance: {
        actorId: actor,
        acceptedAt: "2026-10-13T15:15:00.000Z",
        contextHash: "c".repeat(64),
      },
    },
  });
}

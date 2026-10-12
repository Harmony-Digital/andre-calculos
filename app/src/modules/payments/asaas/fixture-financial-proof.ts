import "server-only";
import { z } from "zod";
import { parseAsaasJson, JsonNumber } from "./json";
import { providerCents } from "./money";
import type { AsaasFinancialSnapshot } from "./financial";
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const effect = z.strictObject({
  id: identifier,
  value: z
    .unknown()
    .transform((v) => providerCents(v))
    .refine((v) => v > 0),
  effectedAt: z.iso.datetime({ offset: true }),
});
const proofSchema = z.strictObject({
  schemaVersion: z.instanceof(JsonNumber).refine((v) => v.source === "1"),
  semantics: z.literal("fixture_chargeback_cumulative"),
  paymentId: identifier,
  reference: z.uuid(),
  caseId: identifier,
  debit: effect,
  reversals: z.array(effect.extend({ reversesDebitId: identifier })).max(100),
});
export type FixtureChargebackProof =
  | Readonly<{ kind: "unknown" | "invalid" }>
  | Readonly<{
      kind: "proven";
      caseId: string;
      debit: { id: string; amountCents: number; effectedAt: string };
      reversals: readonly {
        id: string;
        reversesDebitId: string;
        amountCents: number;
        effectedAt: string;
      }[];
      debitedCents: number;
      reversedCents: number;
      outstandingCents: number;
    }>;
/** Namespace de ensaio, capturado no body imutável de N. Não é contrato Asaas. */
export function readFixtureFinancialProof(
  text: string,
  snapshot: AsaasFinancialSnapshot,
) {
  let sourceOrder: number | null = null;
  let chargeback: FixtureChargebackProof = Object.freeze({ kind: "unknown" });
  try {
    let body = z.record(z.string(), z.unknown()).parse(parseAsaasJson(text));
    if (Array.isArray(body.data) && body.data.length === 1)
      body = z.record(z.string(), z.unknown()).parse(body.data[0]);
    const revision = body.fixtureStateRevision;
    if (
      revision instanceof JsonNumber &&
      /^[1-9][0-9]*$/.test(revision.source)
    ) {
      const n = BigInt(revision.source);
      if (n <= BigInt(Number.MAX_SAFE_INTEGER)) sourceOrder = Number(n);
    }
    const obj = body.chargeback as Record<string, unknown> | null | undefined;
    if (obj && Object.hasOwn(obj, "fixtureProof")) {
      chargeback = Object.freeze({ kind: "invalid" });
      const proof = proofSchema.parse(obj.fixtureProof);
      const ids = new Set([proof.debit.id]);
      let reversed = BigInt(0);
      for (const item of proof.reversals) {
        if (
          ids.has(item.id) ||
          item.reversesDebitId !== proof.debit.id ||
          Date.parse(item.effectedAt) < Date.parse(proof.debit.effectedAt)
        )
          throw new Error("Prova inválida.");
        ids.add(item.id);
        reversed += BigInt(item.value);
      }
      if (
        proof.paymentId !== snapshot.paymentId ||
        proof.reference.toLowerCase() !== snapshot.reference.toLowerCase() ||
        proof.debit.value > snapshot.amounts.currentValueCents ||
        reversed > BigInt(proof.debit.value) ||
        ![
          "REQUESTED",
          "IN_DISPUTE",
          "DISPUTE_LOST",
          "DONE",
          "REVERSED",
        ].includes(snapshot.chargeback?.status ?? "") ||
        (snapshot.chargeback?.status === "REVERSED" &&
          reversed !== BigInt(proof.debit.value))
      )
        throw new Error("Prova inválida.");
      chargeback = Object.freeze({
        kind: "proven",
        caseId: proof.caseId,
        debit: Object.freeze({
          id: proof.debit.id,
          amountCents: proof.debit.value,
          effectedAt: proof.debit.effectedAt,
        }),
        reversals: Object.freeze(
          [...proof.reversals]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((r) =>
              Object.freeze({
                id: r.id,
                reversesDebitId: r.reversesDebitId,
                amountCents: r.value,
                effectedAt: r.effectedAt,
              }),
            ),
        ),
        debitedCents: proof.debit.value,
        reversedCents: Number(reversed),
        outstandingCents: Number(BigInt(proof.debit.value) - reversed),
      });
    }
  } catch {
    /* Fonte incompleta ou prova incoerente conserva incerteza. */
  }
  return Object.freeze({ sourceOrder, chargeback });
}

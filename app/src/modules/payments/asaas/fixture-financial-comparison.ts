import "server-only";
import {
  asaasCumulativeView,
  compareAsaasFinancialSnapshots,
} from "./comparison";
import type { AsaasFinancialSnapshot } from "./financial";
import type { FixtureChargebackProof } from "./fixture-financial-proof";
type Observation = {
  facts: AsaasFinancialSnapshot;
  sourceOrder: number | null;
  chargeback: FixtureChargebackProof;
};
/** A ordem vale apenas para a fixture vinculada; não certifica o contrato externo. */
export function compareFixtureFinancialObservations(
  previous: Observation,
  current: Observation,
) {
  const base = compareAsaasFinancialSnapshots(previous.facts, current.facts);
  const reasons: string[] = [...base.reasons];
  const p = previous.chargeback,
    c = current.chargeback;
  if (previous.sourceOrder === null || current.sourceOrder === null)
    reasons.push("source_order_unknown");
  else if (current.sourceOrder < previous.sourceOrder)
    reasons.push("older_fixture_source");
  else if (
    current.sourceOrder === previous.sourceOrder &&
    (asaasCumulativeView(previous.facts) !==
      asaasCumulativeView(current.facts) ||
      canonicalProof(p) !== canonicalProof(c))
  )
    reasons.push("fixture_order_conflict");
  if (p.kind === "proven") {
    if (
      c.kind !== "proven" ||
      p.caseId !== c.caseId ||
      JSON.stringify(p.debit) !== JSON.stringify(c.debit)
    )
      reasons.push("chargeback_proof_regression");
    else
      for (const reversal of p.reversals) {
        if (
          !c.reversals.some(
            (item) => JSON.stringify(item) === JSON.stringify(reversal),
          )
        )
          reasons.push("chargeback_reversal_history_changed");
      }
  }
  if (c.kind === "invalid") reasons.push("invalid_chargeback_proof");
  return Object.freeze({
    effects: "none" as const,
    relation: reasons.includes("older_fixture_source")
      ? ("older" as const)
      : reasons.length
        ? ("reconcile" as const)
        : base.relation,
    reasons: Object.freeze([...new Set(reasons)]),
    fixtureOrder: current.sourceOrder,
    officialProviderOrder: "unverified" as const,
  });
}

function canonicalProof(proof: FixtureChargebackProof) {
  if (proof.kind !== "proven") return proof.kind;
  return JSON.stringify({
    ...proof,
    reversals: [...proof.reversals].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

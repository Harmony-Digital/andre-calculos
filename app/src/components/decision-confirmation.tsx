"use client";
import { useActionState } from "react";
import {
  confirmDecision,
  type DecisionState,
} from "@/modules/decisions/actions";
export function DecisionConfirmation({
  processId,
  decisionId,
}: {
  processId: string;
  decisionId: string;
}) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(
    async (previous, form) => {
      try {
        return await confirmDecision(previous, form);
      } catch {
        return {
          success: false,
          message: "Não foi possível confirmar. Tente novamente.",
        };
      }
    },
    {},
  );
  return (
    <form
      action={action}
      className="decision-confirmation"
      aria-label="Concordância com esta decisão"
    >
      <input type="hidden" name="processId" value={processId} />
      <input type="hidden" name="decisionId" value={decisionId} />
      <label className="check-option">
        <input
          type="checkbox"
          name="agreed"
          value="yes"
          required
          disabled={pending}
        />{" "}
        Li e estou de acordo com esta decisão.
      </label>
      <button
        className="button button-secondary"
        type="submit"
        disabled={pending}
      >
        {pending ? "Confirmando…" : "Confirmar concordância"}
      </button>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}

"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import {
  parseClientContract,
  contractReceiptSchema,
  type ContractReceipt,
} from "./contract";

export type ContractState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  receipt?: ContractReceipt;
  revision?: number;
  nextRequestId?: string;
};
export async function saveClientContract(
  previous: ContractState,
  form: FormData,
): Promise<ContractState> {
  await authorize(["calculator"]);
  const parsed = parseClientContract(form);
  if (!parsed.success)
    return {
      ...previous,
      success: false,
      message: "Confira a condição e o motivo da alteração.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const { clientId, hasContract, reason, revision, requestId } = parsed.data;
  const db = await createSessionClient();
  try {
    const result = await db.rpc("set_client_contract", {
      target_client: clientId,
      has_contract: hasContract,
      reason,
      expected_revision: revision,
      request_id: requestId,
    });
    const receipt = contractReceiptSchema.safeParse(result.data);
    if (result.error || !receipt.success)
      return {
        ...previous,
        success: false,
        errors: undefined,
        message:
          result.error?.code === "PT423"
            ? "Há uma cobrança pendente de resolução para este cliente. Confira a cobrança antes de alterar a condição de contrato."
            : result.error?.code === "PT409"
              ? "O cadastro ou esta tentativa mudou. Recarregue para conferir antes de salvar."
              : "Não foi possível conferir a gravação. Sua escolha e motivo foram preservados; tente novamente.",
      };
    const current = await db
      .from("clients")
      .select("has_contract,contract_revision")
      .eq("id", clientId)
      .single();
    if (current.error)
      return {
        ...previous,
        success: false,
        errors: undefined,
        message:
          "A tentativa foi registrada, mas não foi possível conferir o cadastro. Tente novamente.",
      };
    if (
      current.data.contract_revision !== receipt.data.revision ||
      current.data.has_contract !== receipt.data.hasContract
    )
      return {
        ...previous,
        success: false,
        errors: undefined,
        message:
          "Esta tentativa já foi registrada e a condição mudou depois. Recarregue para conferir antes de salvar.",
      };
    // A condição atual aparece nas pastas, propostas e na fila de todos os pedidos deste cliente.
    revalidatePath("/painel", "layout");
    revalidatePath("/app", "layout");
    return {
      success: true,
      message: "Condição de contrato salva.",
      receipt: receipt.data,
      revision: receipt.data.revision,
      nextRequestId: randomUUID(),
    };
  } catch {
    return {
      ...previous,
      success: false,
      errors: undefined,
      message:
        "Não foi possível conferir a gravação. Sua escolha e motivo foram preservados; tente novamente.",
    };
  }
}

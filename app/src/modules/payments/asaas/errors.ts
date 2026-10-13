import "server-only";

export type AsaasContractCode =
  | "invalid_json"
  | "invalid_amount"
  | "invalid_data"
  | "identity_mismatch"
  | "obligation_mismatch";

const messages: Record<AsaasContractCode, string> = {
  invalid_json: "Resposta do provedor em formato indisponível.",
  invalid_amount: "Valor do provedor indisponível para conciliação.",
  invalid_data: "Dados do provedor indisponíveis para conciliação.",
  identity_mismatch: "Identidade do provedor divergente.",
  obligation_mismatch: "Vínculo da cobrança divergente.",
};

/** Sem causa, payload, contato, URL ou valor recebido na mensagem. */
export class AsaasContractError extends Error {
  constructor(readonly code: AsaasContractCode) {
    super(messages[code]);
    this.name = "AsaasContractError";
  }
}

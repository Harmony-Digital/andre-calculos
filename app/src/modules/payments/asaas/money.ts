import "server-only";
import { AsaasContractError } from "./errors";
import { JsonNumber } from "./json";

const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const CENTS_PER_UNIT = BigInt(100);
const ZERO = BigInt(0);

export function providerCents(
  input: unknown,
  options: { signed?: boolean } = {},
): number {
  const fail = (): never => {
    throw new AsaasContractError("invalid_amount");
  };
  if (
    !(input instanceof JsonNumber) ||
    typeof input.source !== "string" ||
    input.source.length > 18
  )
    return fail();
  const match = input.source.match(/^(-?)(0|[1-9]\d*)(?:\.(\d{1,2}))?$/);
  if (!match || (match[1] && !options.signed)) return fail();
  const magnitude =
    BigInt(match[2]) * CENTS_PER_UNIT + BigInt((match[3] ?? "").padEnd(2, "0"));
  if (magnitude > MAX_CENTS || (match[1] && magnitude === ZERO)) return fail();
  return Number(match[1] ? -magnitude : magnitude);
}

/** Token numérico JSON; jamais dividir centavos com ponto flutuante. */
export function centsToken(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new AsaasContractError("invalid_amount");
  const amount = BigInt(cents);
  return `${amount / CENTS_PER_UNIT}.${(amount % CENTS_PER_UNIT).toString().padStart(2, "0")}`;
}

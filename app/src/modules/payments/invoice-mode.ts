import "server-only";

/** O transporte real permanece condicionado ao ensaio autorizado de M3.01c. */
export function fixtureInvoiceEnabled() {
  return (
    process.env.ANDRE_LOCAL_TESTS === "1" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321" &&
    !process.env.VERCEL &&
    !process.env.VERCEL_ENV &&
    process.env.NODE_ENV !== "production"
  );
}

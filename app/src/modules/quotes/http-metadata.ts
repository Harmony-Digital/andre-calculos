import { isIP } from "node:net";
/** Evidência HTTP, nunca usada para determinar identidade ou autorização. */
export function acceptanceMetadata(headers: {
  get(name: string): string | null;
}) {
  const ip = headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (!ip || !isIP(ip)) return null;
  const userAgent = (headers.get("user-agent") ?? "")
    // Caracteres de controle são removidos antes do registro de evidência HTTP.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 512);
  return { ip, userAgent };
}

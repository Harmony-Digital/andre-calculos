import "server-only";
export function portalOrigin() {
  const configured = process.env.APP_BASE_URL;
  if (process.env.NODE_ENV === "production" && !configured)
    throw new Error("Origem do portal indisponível.");
  const url = new URL(configured ?? "http://127.0.0.1:3000");
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      )) ||
    url.username ||
    url.password
  )
    throw new Error("Origem do portal indisponível.");
  return url.origin;
}

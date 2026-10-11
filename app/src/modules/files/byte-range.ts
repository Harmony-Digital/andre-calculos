export type ByteRange = { start: number; end: number; header: string };
// Apenas um intervalo: multipart não é necessário para PDF.js.
export function parseByteRange(
  value: string | null,
  size: number,
): ByteRange | null {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (
    !match ||
    (!match[1] && !match[2]) ||
    !Number.isSafeInteger(size) ||
    size < 1
  )
    throw new Error("Intervalo inválido.");
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1)
      throw new Error("Intervalo inválido.");
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start >= size ||
      start > end
    )
      throw new Error("Intervalo inválido.");
    end = Math.min(end, size - 1);
  }
  return { start, end, header: `bytes=${start}-${end}` };
}

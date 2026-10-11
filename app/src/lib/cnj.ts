/** Resolução CNJ 65/2008, Anexo VIII. Inteiros curtos evitam perda de precisão. */
function modulo97(digits: string): number {
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder;
}

export function parseLaborCnj(value: string) {
  const text = value.trim();
  if (!/^(\d{20}|\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})$/.test(text))
    return null;
  const digits = text.replace(/\D/g, "");
  const sequence = digits.slice(0, 7);
  const check = digits.slice(7, 9);
  const year = digits.slice(9, 13);
  const segment = digits[13];
  const tribunal = Number(digits.slice(14, 16));
  const origin = digits.slice(16);
  if (segment !== "5" || tribunal < 1 || tribunal > 24 || Number(year) < 1900)
    return null;
  if (
    modulo97(
      sequence + year + segment + digits.slice(14, 16) + origin + check,
    ) !== 1
  )
    return null;
  return {
    digits,
    year: Number(year),
    tribunal,
    origin,
    formatted: `${sequence}-${check}.${year}.${segment}.${digits.slice(14, 16)}.${origin}`,
  };
}

export function isValidLaborCnj(value: string): boolean {
  return parseLaborCnj(value) !== null;
}

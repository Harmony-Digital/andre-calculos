// Receita Federal: módulo 11; CNPJ alfanumérico usa ASCII - 48 (A = 17).
export function normalizeDocument(value: string) {
  const normalized = value.trim().toUpperCase();
  if (
    /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(normalized) ||
    /^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}$/.test(
      normalized,
    )
  )
    return normalized.replace(/[.\/-]/g, "");
  return normalized;
}
const checkDigit = (values: number[], weights: number[]) => {
  const remainder =
    values.reduce((sum, value, index) => sum + value * weights[index], 0) % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};
export function validCpf(value: string) {
  const cpf = normalizeDocument(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = [...cpf].map(Number);
  return (
    checkDigit(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]) ===
      digits[9] &&
    checkDigit(digits.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) ===
      digits[10]
  );
}
export function validCnpj(value: string) {
  const cnpj = normalizeDocument(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj))
    return false;
  const values = [...cnpj].map((character) => character.charCodeAt(0) - 48);
  return (
    checkDigit(values.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) ===
      values[12] &&
    checkDigit(values.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) ===
      values[13]
  );
}

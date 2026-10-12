import "server-only";
import { AsaasContractError } from "./errors";

/** O token nunca passa por Number()/JSON.parse antes de validar a moeda. */
export class JsonNumber {
  constructor(readonly source: string) {
    Object.freeze(this);
  }
}

const MAX_BYTES = 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_NODES = 10000;
const MAX_ARRAY = 1000;

/** JSON limitado, sem perda decimal e sem interpretação ambígua de chaves. */
export function parseAsaasJson(text: string): unknown {
  const fail = (): never => {
    throw new AsaasContractError("invalid_json");
  };
  if (
    typeof text !== "string" ||
    text.length > MAX_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_BYTES
  )
    fail();
  let at = 0;
  let nodes = 0;
  const spaces = () => {
    while (/[\x20\x09\x0a\x0d]/.test(text[at] ?? "")) at++;
  };
  function string(): string {
    if (text[at] !== '"') fail();
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === "\\") at++;
      else if (char === '"') {
        try {
          return JSON.parse(text.slice(start, at)) as string;
        } catch {
          fail();
        }
      }
    }
    return fail();
  }
  function value(depth: number): unknown {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) fail();
    spaces();
    if (text[at] === '"') return string();
    if (text[at] === "{") {
      at++;
      const result: Record<string, unknown> = Object.create(null);
      const keys = new Set<string>();
      spaces();
      if (text[at] === "}") {
        at++;
        return result;
      }
      while (true) {
        spaces();
        const key = string();
        if (keys.has(key)) fail();
        keys.add(key);
        spaces();
        if (text[at++] !== ":") fail();
        result[key] = value(depth + 1);
        spaces();
        const delimiter = text[at++];
        if (delimiter === "}") return result;
        if (delimiter !== ",") fail();
      }
    }
    if (text[at] === "[") {
      at++;
      const result: unknown[] = [];
      spaces();
      if (text[at] === "]") {
        at++;
        return result;
      }
      while (true) {
        if (result.length >= MAX_ARRAY) fail();
        result.push(value(depth + 1));
        spaces();
        const delimiter = text[at++];
        if (delimiter === "]") return result;
        if (delimiter !== ",") fail();
      }
    }
    for (const [literal, result] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const)
      if (text.startsWith(literal, at)) {
        at += literal.length;
        return result;
      }
    const token = text
      .slice(at)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[Ee][+-]?\d+)?/);
    if (!token) return fail();
    at += token[0].length;
    return new JsonNumber(token[0]);
  }
  const result = value(0);
  spaces();
  if (at !== text.length) fail();
  return result;
}

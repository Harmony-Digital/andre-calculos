import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { hashFile, hashChunkBytes } from "./hash";
it("confere SHA-256 sem ler o arquivo inteiro em uma única operação", async () => {
  const bytes = new Uint8Array(hashChunkBytes * 2 + 37);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const file = new Blob([bytes]);
  const sizes: number[] = [],
    progress: number[] = [];
  const read = file.slice.bind(file);
  file.slice = (start, end) => {
    const chunk = read(start, end);
    sizes.push(chunk.size);
    return chunk;
  };
  file.arrayBuffer = () => {
    throw new Error("Leitura integral proibida.");
  };
  expect(await hashFile(file, (value) => progress.push(value))).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  );
  expect(sizes).toEqual([hashChunkBytes, hashChunkBytes, 37]);
  expect(progress.at(-1)).toBe(100);
});

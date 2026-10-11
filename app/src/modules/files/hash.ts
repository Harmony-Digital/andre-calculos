import { createSHA256 } from "hash-wasm";
export const hashChunkBytes = 4 * 1024 * 1024;
export async function hashFile(
  file: Blob,
  onProgress?: (percent: number) => void,
) {
  const hash = await createSHA256();
  hash.init();
  for (let offset = 0; offset < file.size; offset += hashChunkBytes) {
    const end = Math.min(offset + hashChunkBytes, file.size);
    hash.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
    onProgress?.(Math.round((end / file.size) * 100));
  }
  return hash.digest("hex");
}

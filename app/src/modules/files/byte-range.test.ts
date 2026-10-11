import { describe, expect, it } from "vitest";
import { parseByteRange } from "./byte-range";
describe("intervalos de leitura de PDF", () => {
  it("distingue leitura completa de intervalos válidos", () => {
    expect(parseByteRange(null, 100)).toBeNull();
    for (const [input, start, end] of [
      ["bytes=0-0", 0, 0],
      ["bytes=15-20", 15, 20],
      ["bytes=80-", 80, 99],
      ["bytes=80-999", 80, 99],
      ["bytes=-20", 80, 99],
      ["bytes=-200", 0, 99],
    ] as const)
      expect(parseByteRange(input, 100)).toEqual({
        start,
        end,
        header: `bytes=${start}-${end}`,
      });
  });
  it.each([
    "bytes=-0",
    "bytes=-",
    "bytes=100-",
    "bytes=20-10",
    "bytes=0-1,2-3",
    "bytes=1.5-2",
    "bytes=-1-2",
    "bytes=1e2-",
    "bytes=9007199254740992-",
    "items=0-1",
    "bytes=0-999999999999999999",
  ])("recusa %s", (input) => {
    expect(() => parseByteRange(input, 100)).toThrow();
  });
});

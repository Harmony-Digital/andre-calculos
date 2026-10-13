import { describe, expect, it, vi } from "vitest";
import { independentCleanup } from "./independent-cleanup";

describe("limpeza independente dos ensaios", () => {
  it("tenta todos os recursos quando página e sessão falham", async () => {
    const calls: string[] = [],
      report = vi.fn();
    await independentCleanup(
      ["page", "context", "session", "process", "fixture"].map((name) => ({
        name,
        run: async () => {
          calls.push(name);
          if (name === "page" || name === "session")
            throw new Error("Conteúdo privado que não deve ir ao relatório");
        },
      })),
      true,
      report,
    );
    expect(calls).toEqual(["page", "context", "session", "process", "fixture"]);
    expect(report).toHaveBeenCalledWith(["page", "session"]);
  });

  it("preserva a identidade do erro principal no finally", async () => {
    const primary = new Error("Falha original"),
      release = vi.fn();
    const journey = async () => {
      let failed = false;
      try {
        throw primary;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        await independentCleanup(
          [
            {
              name: "page",
              run: async () => {
                throw new Error("Página fechada");
              },
            },
            {
              name: "fixture",
              run: async () => {
                release();
              },
            },
          ],
          failed,
          () => {},
        );
      }
    };
    await expect(journey()).rejects.toBe(primary);
    expect(release).toHaveBeenCalledOnce();
  });

  it("recusa sucesso quando a limpeza falha e ainda tenta os demais recursos", async () => {
    const release = vi.fn(),
      report = vi.fn();
    await expect(
      independentCleanup(
        [
          {
            name: "context",
            run: async () => {
              throw new Error("Falha privada");
            },
          },
          {
            name: "fixture",
            run: async () => {
              release();
            },
          },
        ],
        false,
        report,
      ),
    ).rejects.toThrow("Limpeza incompleta: context.");
    expect(release).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(["context"]);
  });

  it("não relata falhas quando todos os recursos são liberados", async () => {
    const report = vi.fn();
    await independentCleanup(
      [{ name: "fixture", run: async () => {} }],
      false,
      report,
    );
    expect(report).not.toHaveBeenCalled();
  });
});

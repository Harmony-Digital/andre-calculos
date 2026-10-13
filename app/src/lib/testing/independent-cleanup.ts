export type CleanupStep = {
  name: string;
  run: () => Promise<unknown>;
};

// Uma página fechada não pode impedir a restauração das fixtures seguintes.
export async function independentCleanup(
  steps: CleanupStep[],
  primaryFailed: boolean,
  report: (failed: string[]) => void,
) {
  const failed: string[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch {
      failed.push(step.name);
    }
  }
  if (failed.length) {
    report(failed);
    if (!primaryFailed)
      throw new Error(`Limpeza incompleta: ${failed.join(", ")}.`);
  }
}

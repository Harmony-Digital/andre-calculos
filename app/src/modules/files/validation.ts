import { z } from "zod";
export const maxFileBytes = 500_000_000;
const extensions: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "text/csv": ["csv"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "docx",
  ],
  "application/octet-stream": ["pjc"],
};
export const uploadSchema = z
  .object({
    processId: z.uuid(),
    name: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (name) => !/[\x00-\x1f/\\]/.test(name),
        "Nome de arquivo inválido.",
      ),
    mime: z.enum(Object.keys(extensions) as [string, ...string[]]),
    size: z.number().int().min(1).max(maxFileBytes),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    folder: z
      .enum(["case", "client", "triage", "deliverables"])
      .default("case"),
  })
  .refine(
    (file) =>
      extensions[file.mime]?.includes(
        file.name.split(".").at(-1)?.toLowerCase() ?? "",
      ),
    {
      path: ["name"],
      message: "O tipo e a extensão do arquivo não correspondem.",
    },
  );
export function fileMime(file: { name: string; type: string }) {
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  return (
    Object.entries(extensions).find(([, values]) =>
      values.includes(ext ?? ""),
    )?.[0] ?? file.type
  );
}

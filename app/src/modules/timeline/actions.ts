"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { parseNote } from "./forms";
export type NoteState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  nextRequestId?: string;
};
export async function addNote(
  previous: NoteState,
  form: FormData,
): Promise<NoteState> {
  await authorize(["calculator"]);
  const parsed = parseNote(form);
  if (!parsed.success)
    return {
      success: false,
      nextRequestId: previous.nextRequestId,
      message: "Confira os campos indicados.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const db = await createSessionClient(),
    value = parsed.data;
  const result = await db.rpc("add_process_note", {
    target_process: value.processId,
    note_body: value.body,
    request_id: value.requestId,
  });
  if (result.error)
    return {
      success: false,
      nextRequestId: previous.nextRequestId,
      message:
        "Não foi possível registrar. Seu texto foi preservado; tente novamente.",
    };
  revalidatePath(`/painel/processos/${value.processId}`);
  revalidatePath(`/app/processos/${value.processId}`);
  return {
    success: true,
    message: "Nota registrada.",
    nextRequestId: randomUUID(),
  };
}

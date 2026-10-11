"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { createSystemClient } from "@/lib/supabase/admin";
import { uploadSchema } from "./validation";

export async function prepareUpload(input: unknown) {
  await authorize(["client", "calculator"]);
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Confira o tipo, nome e tamanho do arquivo (até 500 MB)." };
  const file = parsed.data;
  const supabase = await createSessionClient();
  const prepared = await supabase.rpc("prepare_file_upload", {
    target_process: file.processId,
    file_name: file.name,
    file_mime: file.mime,
    file_size: file.size,
    expected_hash: file.sha256,
    target_folder: file.folder,
  });
  if (prepared.error || !prepared.data?.[0])
    return {
      error:
        "Não foi possível preparar o envio. Confira seu acesso ao processo.",
    };
  const target = prepared.data[0];
  const signed = await supabase.storage
    .from("processos")
    .createSignedUploadUrl(target.object_path, { upsert: false });
  if (signed.error || !signed.data)
    return { error: "Não foi possível autorizar o envio. Tente novamente." };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const endpoint = url.startsWith("http://127.0.0.1:")
    ? `${url}/storage/v1/upload/resumable/sign`
    : `${new URL(url).origin.replace(".supabase.co", ".storage.supabase.co")}/storage/v1/upload/resumable/sign`;
  return {
    fileId: target.file_id,
    path: target.object_path,
    token: signed.data.token,
    endpoint,
  };
}

export async function completeUpload(fileId: string) {
  const { user } = await authorize(["client", "calculator"]);
  if (!z.uuid().safeParse(fileId).success)
    return { error: "Arquivo inválido." };
  const session = await createSessionClient();
  const { data: file, error } = await session
    .from("files")
    .select(
      "id,path,process_id,size_bytes,expected_sha256,uploaded_by,upload_status",
    )
    .eq("id", fileId)
    .single();
  if (
    error ||
    !file ||
    file.uploaded_by !== user.id ||
    file.upload_status !== "pending"
  )
    return { error: "Envio indisponível." };
  // A permissão foi conferida com o JWT do usuário antes do cliente de sistema.
  const system = createSystemClient();
  const signed = await system.storage
    .from("processos")
    .createSignedUrl(file.path, 120);
  if (signed.error || !signed.data)
    return { error: "O envio ainda não terminou. Retome para continuar." };
  const response = await fetch(signed.data.signedUrl, { cache: "no-store" });
  if (!response.ok || !response.body)
    return { error: "Não foi possível conferir o arquivo." };
  const reader = response.body.getReader(),
    hash = createHash("sha256");
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > file.size_bytes) {
      await reader.cancel();
      return { error: "O tamanho do arquivo não corresponde ao envio." };
    }
    hash.update(value);
  }
  const digest = hash.digest("hex");
  if (size !== file.size_bytes || digest !== file.expected_sha256)
    return {
      error: "A integridade do arquivo não foi confirmada. Faça um novo envio.",
    };
  const completed = await system.rpc("complete_file_system", {
    target_file: file.id,
    actor: user.id,
    observed_hash: digest,
    observed_size: size,
  });
  if (completed.error)
    return { error: "Não foi possível registrar o envio. Tente novamente." };
  revalidatePath(`/app/processos/${file.process_id}`);
  revalidatePath(`/painel/processos/${file.process_id}`);
  return { success: true };
}

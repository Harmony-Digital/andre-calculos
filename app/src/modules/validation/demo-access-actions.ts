"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuthFormState } from "@/modules/auth/forms";
import { createDemoSession } from "./demo-access";

export async function enterDemo(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const destination = await createDemoSession(form, await headers());
  if (!destination)
    return {
      message: "O acesso de demonstração está temporariamente indisponível.",
    };
  revalidatePath("/", "layout");
  redirect(destination);
}

import { AuthPage } from "@/components/auth-page";
import { AuthForm } from "@/components/auth-form";
import { requireRole } from "@/modules/auth/session";
export const dynamic = "force-dynamic";
export default async function NewPassword() {
  await requireRole(["client", "calculator", "admin"]);
  return (
    <AuthPage
      title="Escolha sua nova senha."
      description="Use pelo menos 12 caracteres. Após salvar, entre novamente para continuar."
      cardTitle="Atualizar senha"
    >
      <AuthForm mode="password" />
    </AuthPage>
  );
}

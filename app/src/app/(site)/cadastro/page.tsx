import { AuthPage } from "@/components/auth-page";
import { SignupForm } from "@/components/signup-form";
import { registrationLegal } from "@/modules/signup/legal";
export const dynamic = "force-dynamic";
export default async function Signup() {
  const legal = await registrationLegal();
  return (
    <AuthPage
      title="Comece pelo seu cadastro."
      description="Sua conta é gratuita. Organize os dados dos processos e solicite seus cálculos em um só lugar."
      cardTitle="Criar conta"
    >
      <SignupForm legal={legal} />
    </AuthPage>
  );
}

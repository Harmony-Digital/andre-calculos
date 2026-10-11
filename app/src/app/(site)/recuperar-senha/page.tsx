import { AuthPage } from "@/components/auth-page";
import { AuthForm } from "@/components/auth-form";
import { supabaseConfig } from "@/lib/supabase/config";
export default function Recovery() {
  return (
    <AuthPage
      title="Recupere seu acesso."
      description="Enviaremos um link para você escolher uma nova senha."
      cardTitle="Recuperar senha"
    >
      <AuthForm mode="recovery" enabled={!!supabaseConfig()} />
    </AuthPage>
  );
}

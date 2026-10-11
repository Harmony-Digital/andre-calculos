import Link from "next/link";
import { AuthPage } from "@/components/auth-page";
import { AuthForm } from "@/components/auth-form";
import { supabaseConfig } from "@/lib/supabase/config";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; senha?: string }>;
}) {
  const params = await searchParams;
  const enabled = !!supabaseConfig();
  return (
    <AuthPage
      title="Bem-vindo de volta."
      description="Acesse seus pedidos, documentos e entregas em um só lugar."
      cardTitle="Acessar minha conta"
    >
      {params.senha === "atualizada" && (
        <div className="notice" role="status">
          Senha atualizada. Entre com a nova senha.
        </div>
      )}
      <AuthForm next={params.next} enabled={enabled} />
      <details style={{ marginTop: 24 }}>
        <summary>Entrar com um link por e-mail</summary>
        <AuthForm mode="link" enabled={enabled} />
      </details>
      <p>
        Primeira vez por aqui?{" "}
        <Link href="/cadastro" className="text-link">
          Criar conta gratuita
        </Link>
      </p>
    </AuthPage>
  );
}

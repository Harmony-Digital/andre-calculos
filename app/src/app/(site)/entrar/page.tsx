import Link from "next/link";
import { AuthPage } from "@/components/auth-page";
import { AuthForm } from "@/components/auth-form";
import { supabaseConfig } from "@/lib/supabase/config";
import { DemoAccessForm } from "@/components/demo-access-form";
import { hostedValidationEnabled } from "@/modules/validation/environment";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; senha?: string; link?: string }>;
}) {
  const params = await searchParams;
  if (hostedValidationEnabled(process.env)) {
    return (
      <AuthPage
        title="Conheça o portal por dentro."
        description="Explore os pedidos, os orçamentos e a linha do tempo com processos de demonstração."
        cardTitle="Escolha como deseja entrar"
      >
        <DemoAccessForm />
        <p>
          <Link href="/demonstracao" className="text-link">
            Ver apresentação guiada
          </Link>
        </p>
      </AuthPage>
    );
  }
  const enabled = !!supabaseConfig();
  const invalidLink = params.link === "invalido";
  return (
    <AuthPage
      title="Bem-vindo de volta."
      description="Acesse seus pedidos, documentos e entregas em um só lugar."
      cardTitle="Acessar minha conta"
    >
      {invalidLink && (
        <div className="notice" role="alert">
          Não foi possível usar este link. Solicite um novo link abaixo ou use
          “Esqueci minha senha” para redefinir a senha. Abra o e-mail no mesmo
          navegador em que fez a solicitação.
        </div>
      )}
      {params.senha === "atualizada" && (
        <div className="notice" role="status">
          Senha atualizada. Entre com a nova senha.
        </div>
      )}
      <AuthForm next={params.next} enabled={enabled} />
      <details open={invalidLink} style={{ marginTop: 24 }}>
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

import Link from "next/link";
import { AuthPage } from "@/components/auth-page";
export default function Forbidden() {
  return (
    <AuthPage
      title="Acesso negado."
      description="Sua conta não tem permissão para acessar esta área."
      cardTitle="Continue na sua área"
    >
      <Link className="button" href="/app">
        Ir para meus processos
      </Link>
      <p>
        <Link className="text-link" href="/entrar">
          Voltar ao acesso
        </Link>
      </p>
    </AuthPage>
  );
}

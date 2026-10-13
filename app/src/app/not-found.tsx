import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
        </div>
      </header>
      <main id="conteudo" className="container py-16 sm:py-24">
        <section className="max-w-2xl" aria-labelledby="pagina-indisponivel">
          <span className="eyebrow">Página indisponível · 404</span>
          <h1 id="pagina-indisponivel" className="text-4xl sm:text-5xl">
            Página não encontrada
          </h1>
          <p className="mt-6 max-w-xl text-xl text-muted-foreground">
            Não foi possível encontrar esta página. Confira o endereço ou volte
            para sua conta.
          </p>
          <nav
            aria-label="Opções para continuar"
            className="mt-8 flex flex-wrap gap-4"
          >
            <Link href="/entrar" className="button">
              Acessar minha conta
            </Link>
            <Link href="/" className="button button-outline">
              Voltar à página inicial
            </Link>
          </nav>
        </section>
      </main>
    </>
  );
}

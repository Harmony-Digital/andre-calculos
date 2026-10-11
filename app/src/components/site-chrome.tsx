import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "./brand";
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav aria-label="Navegação principal" className="site-nav">
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/#entregas">O que você recebe</Link>
          <Link href="/#duvidas">Dúvidas</Link>
        </nav>
        <div className="header-actions">
          <Link href="/entrar">Acessar minha conta</Link>
          <Link className="button button-small" href="/cadastro">
            Criar conta <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-inner">
          <div>
            <Brand />
            <p className="footer-note">
              Serviço de cálculos judiciais com revisão técnica e registro das
              decisões do processo.
            </p>
          </div>
          <nav className="footer-links" aria-label="Informações legais">
            <Link href="/termos">Termos de uso</Link>
            <Link href="/privacidade">Privacidade</Link>
          </nav>
        </div>
        {process.env.NODE_ENV !== "production" && (
          <p className="dev-note">
            Prévia de desenvolvimento. Nome completo, categoria profissional e
            CRC do responsável técnico aguardam confirmação.
          </p>
        )}
      </div>
    </footer>
  );
}

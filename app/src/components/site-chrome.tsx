import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "./brand";
import { getPublicServiceInfo } from "@/modules/settings/queries";
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
export async function SiteFooter() {
  const info = await getPublicServiceInfo();
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
        {info?.technical_name &&
        info.crc_number &&
        info.crc_state &&
        info.crc_category ? (
          <div className="technical-info">
            <p>
              Responsável técnico: {info.technical_name} · {info.crc_category} ·
              CRC {info.crc_state} {info.crc_number}
            </p>
            {info.contact_email && (
              <p>
                <a href={`mailto:${info.contact_email}`}>
                  {info.contact_email}
                </a>
              </p>
            )}
          </div>
        ) : (
          process.env.NODE_ENV !== "production" && (
            <p className="dev-note">
              Prévia de desenvolvimento. Nome completo, categoria profissional e
              CRC do responsável técnico aguardam confirmação.
            </p>
          )
        )}
      </div>
    </footer>
  );
}

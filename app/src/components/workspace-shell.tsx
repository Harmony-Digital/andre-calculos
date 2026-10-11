"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  Plus,
  UserRound,
  ListOrdered,
  Users,
  Settings,
  ArrowUpRight,
  ClipboardList,
} from "lucide-react";
import { Brand } from "./brand";
const customerLinks = [
  { href: "/app", label: "Processos", icon: FolderOpen },
  { href: "/app/novo-pedido", label: "Novo pedido", icon: Plus },
  { href: "/app/conta", label: "Minha conta", icon: UserRound },
];
const panelLinks = [
  { href: "/painel", label: "Visão geral", icon: ClipboardList },
  { href: "/painel/fila", label: "Fila de trabalho", icon: ListOrdered },
  { href: "/painel/pedidos", label: "Pedidos", icon: FolderOpen },
  { href: "/painel/clientes", label: "Clientes", icon: Users },
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings },
];
export function WorkspaceShell({
  children,
  panel = false,
}: {
  children: React.ReactNode;
  panel?: boolean;
}) {
  const pathname = usePathname();
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Brand />
        <span className="sidebar-label">
          {panel ? "Área do calculista" : "Área do advogado"}
        </span>
        <nav
          className="side-nav"
          aria-label={panel ? "Painel do André" : "Área do cliente"}
        >
          {(panel ? panelLinks : customerLinks).map(
            ({ href, label, icon: Icon }) => (
              <Link
                className="side-link"
                href={href}
                key={href}
                aria-current={pathname === href ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                {label}
              </Link>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <Link className="side-link" href="/">
            <ArrowUpRight size={18} aria-hidden="true" />
            Voltar ao site
          </Link>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <span>
            {panel ? "Gestão dos cálculos" : "Seu espaço de trabalho"}
          </span>
          <span className="workspace-id">
            <span className="avatar" aria-hidden="true">
              {panel ? "A" : "C"}
            </span>
            {panel ? "André" : "Minha conta"}
          </span>
        </header>
        <main id="conteudo" className="workspace-main">
          {children}
        </main>
      </div>
    </div>
  );
}

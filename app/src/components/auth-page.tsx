import type { ReactNode } from "react";
export function AuthPage({
  title,
  description,
  cardTitle,
  children,
}: {
  title: string;
  description: string;
  cardTitle: string;
  children: ReactNode;
}) {
  return (
    <main id="conteudo" className="container auth-layout">
      <div className="auth-intro">
        <span className="eyebrow">Seu espaço de trabalho</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <section className="auth-card" aria-labelledby="auth-title">
        <h2 id="auth-title">{cardTitle}</h2>
        {children}
      </section>
    </main>
  );
}

import Link from "next/link";
export function AuthPlaceholder({ signup = false }: { signup?: boolean }) {
  return (
    <main id="conteudo" className="container auth-layout">
      <div className="auth-intro">
        <span className="eyebrow">
          {signup ? "Comece pelo cadastro gratuito" : "Seu espaço de trabalho"}
        </span>
        <h1>
          {signup
            ? "Mais clareza para o seu próximo processo."
            : "Bem-vindo de volta."}
        </h1>
        <p>
          {signup
            ? "Solicite o orçamento e acompanhe cada etapa do cálculo, com tudo organizado na pasta do processo."
            : "Acesse seus pedidos, documentos e entregas em um só lugar."}
        </p>
      </div>
      <section className="auth-card" aria-labelledby="auth-title">
        <h2 id="auth-title">
          {signup ? "Criar minha conta" : "Acessar minha conta"}
        </h2>
        <div className="notice" role="status">
          O acesso será disponibilizado em breve. Esta é uma prévia do portal.
        </div>
        <fieldset disabled style={{ border: 0, padding: 0, margin: 0 }}>
          {signup && (
            <div className="form-field">
              <label htmlFor="full-name">Nome completo</label>
              <input id="full-name" autoComplete="name" />
            </div>
          )}
          <div className="form-field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="email" />
          </div>
          <div className="form-field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
            />
          </div>
          <button className="button" type="button" style={{ width: "100%" }}>
            {signup ? "Criar conta gratuita" : "Entrar"}
          </button>
        </fieldset>
        <p style={{ fontSize: 14, marginTop: 22, marginBottom: 0 }}>
          {signup ? "Já tem uma conta? " : "Primeira vez por aqui? "}
          <Link className="text-link" href={signup ? "/entrar" : "/cadastro"}>
            {signup ? "Acessar minha conta" : "Criar conta gratuita"}
          </Link>
        </p>
      </section>
    </main>
  );
}

"use client";
import { useActionState } from "react";
import Link from "next/link";
import { login, requestLink, changePassword } from "@/modules/auth/actions";
import type { AuthFormState } from "@/modules/auth/forms";

export function AuthForm({
  mode = "login",
  next = "",
  enabled = true,
}: {
  mode?: "login" | "link" | "recovery" | "password";
  next?: string;
  enabled?: boolean;
}) {
  const action =
    mode === "login"
      ? login
      : mode === "password"
        ? changePassword
        : requestLink;
  const [state, submit, pending] = useActionState(action, {} as AuthFormState);
  const password = mode === "password";
  return (
    <form action={submit}>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="intent" value={mode} />
      {!enabled && (
        <div className="notice" role="status">
          O acesso está temporariamente indisponível.
        </div>
      )}
      {state.message && (
        <div className="notice" role={state.success ? "status" : "alert"}>
          {state.message}
        </div>
      )}
      <fieldset
        disabled={pending || !enabled}
        style={{ border: 0, margin: 0, padding: 0 }}
      >
        {!password && (
          <div className="form-field">
            <label htmlFor={mode + "-email"}>E-mail</label>
            <input
              id={mode + "-email"}
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              aria-invalid={!!state.errors?.email}
              aria-describedby={
                state.errors?.email ? mode + "-email-error" : undefined
              }
            />
            {state.errors?.email && (
              <p className="field-error" id={mode + "-email-error"}>
                {state.errors.email[0]}
              </p>
            )}
          </div>
        )}
        {(mode === "login" || password) && (
          <div className="form-field">
            <label htmlFor="password">
              {password ? "Nova senha" : "Senha"}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={password ? "new-password" : "current-password"}
              minLength={password ? 12 : undefined}
              maxLength={256}
              required
              aria-invalid={!!state.errors?.password}
              aria-describedby={
                state.errors?.password ? "password-error" : undefined
              }
            />
            {state.errors?.password && (
              <p className="field-error" id="password-error">
                {state.errors.password[0]}
              </p>
            )}
          </div>
        )}
        {password && (
          <div className="form-field">
            <label htmlFor="confirmation">Confirme a nova senha</label>
            <input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={!!state.errors?.confirmation}
              aria-describedby={
                state.errors?.confirmation ? "confirmation-error" : undefined
              }
            />
            {state.errors?.confirmation && (
              <p className="field-error" id="confirmation-error">
                {state.errors.confirmation[0]}
              </p>
            )}
          </div>
        )}
        <button className="button" style={{ width: "100%" }} type="submit">
          {pending
            ? "Aguarde…"
            : mode === "login"
              ? "Entrar"
              : password
                ? "Salvar nova senha"
                : "Enviar link por e-mail"}
        </button>
      </fieldset>
      {mode === "login" && (
        <p style={{ marginTop: 18 }}>
          <Link className="text-link" href="/recuperar-senha">
            Esqueci minha senha
          </Link>
        </p>
      )}
    </form>
  );
}

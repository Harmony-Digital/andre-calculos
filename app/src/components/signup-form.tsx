"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signup } from "@/modules/signup/actions";
import type { AuthFormState } from "@/modules/auth/forms";
import { brazilStates } from "@/lib/brazil";
export function SignupForm({
  legal,
}: {
  legal: {
    enabled: boolean;
    termsVersion: string;
    privacyVersion: string;
    testOnly: boolean;
  };
}) {
  const [state, submit, pending] = useActionState(signup, {} as AuthFormState);
  const field = (
    name: string,
    label: string,
    type = "text",
    required = true,
    max = 200,
    autoComplete?: string,
  ) => (
    <div className="form-field" key={name}>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        maxLength={max}
        minLength={type === "password" ? 12 : undefined}
        autoComplete={autoComplete}
        aria-invalid={!!state.errors?.[name]}
        aria-describedby={state.errors?.[name] ? `${name}-error` : undefined}
      />
      {state.errors?.[name] && (
        <p className="field-error" id={`${name}-error`}>
          {state.errors[name][0]}
        </p>
      )}
    </div>
  );
  return (
    <form action={submit}>
      {!legal.enabled && (
        <p className="notice" role="status">
          O cadastro aguarda a conclusão dos termos e da política de
          privacidade.
        </p>
      )}
      {legal.testOnly && (
        <p className="notice">
          Cadastro de teste local. Use apenas dados fictícios; os documentos
          deste ensaio não têm vigência.
        </p>
      )}
      {state.message && (
        <p className="notice" role={state.success ? "status" : "alert"}>
          {state.message}
        </p>
      )}
      <input type="hidden" name="termsVersion" value={legal.termsVersion} />
      <input type="hidden" name="privacyVersion" value={legal.privacyVersion} />
      <fieldset
        className="plain-fieldset"
        disabled={!legal.enabled || pending || state.success}
      >
        <div className="form-grid">
          {field("fullName", "Nome completo", "text", true, 200, "name")}
          {field("email", "E-mail", "email", true, 254, "email")}
          {field("phone", "Celular com DDD", "tel", true, 30, "tel")}
          {field(
            "legalName",
            "Escritório ou empresa",
            "text",
            true,
            200,
            "organization",
          )}
          {field("city", "Cidade", "text", false, 120, "address-level2")}
          <div className="form-field">
            <label htmlFor="kind">Tipo de cadastro</label>
            <select name="kind" id="kind" defaultValue="person">
              <option value="person">Pessoa física (CPF)</option>
              <option value="company">Pessoa jurídica (CNPJ)</option>
            </select>
          </div>
          {field("document", "CPF ou CNPJ", "text", true, 18)}
          {field("oabNumber", "Número da OAB (opcional)", "text", false, 30)}
          <div className="form-field">
            <label htmlFor="oabState">UF da OAB</label>
            <select id="oabState" name="oabState" defaultValue="">
              <option value="">Selecione</option>
              {brazilStates.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
            <small>Departamento jurídico pode deixar a OAB vazia.</small>
          </div>
          {field("password", "Senha", "password", true, 256, "new-password")}
          {field(
            "confirmation",
            "Confirme a senha",
            "password",
            true,
            256,
            "new-password",
          )}
        </div>
        <label className="check-option">
          <input
            type="checkbox"
            name="accepted"
            value="yes"
            required
            aria-invalid={!!state.errors?.accepted}
            aria-describedby={
              state.errors?.accepted ? "accepted-error" : undefined
            }
          />
          <span>
            Li e aceito os{" "}
            <Link className="text-link" href="/termos" target="_blank">
              termos de uso
            </Link>{" "}
            e a{" "}
            <Link className="text-link" href="/privacidade" target="_blank">
              política de privacidade
            </Link>
            .
          </span>
        </label>
        {state.errors?.accepted && (
          <p className="field-error" id="accepted-error">
            {state.errors.accepted[0]}
          </p>
        )}
        <button className="button" type="submit">
          {pending ? "Criando conta…" : "Criar minha conta"}
        </button>
      </fieldset>
      <p>
        Já tem cadastro?{" "}
        <Link className="text-link" href="/entrar">
          Entrar
        </Link>
        .
      </p>
    </form>
  );
}

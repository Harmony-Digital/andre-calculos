"use client";

import { useActionState } from "react";
import { enterDemo } from "@/modules/validation/demo-access-actions";
import type { AuthFormState } from "@/modules/auth/forms";

export function DemoAccessForm() {
  const [state, submit, pending] = useActionState(
    enterDemo,
    {} as AuthFormState,
  );

  return (
    <form action={submit} aria-label="Acesso de demonstração">
      <p className="demo-access-note">
        Escolha uma visão para conhecer o sistema. Os dados são fictícios e você
        não precisa informar senha.
      </p>
      {state.message && (
        <div className="notice" role="alert">
          {state.message}
        </div>
      )}
      <fieldset className="demo-access-options" disabled={pending}>
        <legend className="sr-only">Escolha como deseja entrar</legend>
        <div className="demo-access-option">
          <h3>Visão do advogado</h3>
          <p>
            Solicite orçamentos, acompanhe processos e consulte suas entregas.
          </p>
          <button
            className="button"
            type="submit"
            name="persona"
            value="lawyer"
          >
            Entrar como advogado
          </button>
        </div>
        <div className="demo-access-option">
          <h3>Visão do André</h3>
          <p>Gerencie pedidos, ajuste orçamentos e acompanhe os cálculos.</p>
          <button
            className="button button-outline"
            type="submit"
            name="persona"
            value="calculator"
          >
            Entrar como André
          </button>
        </div>
      </fieldset>
      {pending && (
        <p role="status" aria-live="polite">
          Abrindo a demonstração…
        </p>
      )}
    </form>
  );
}

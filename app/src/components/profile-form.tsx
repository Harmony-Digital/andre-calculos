"use client";
import { useActionState } from "react";
import { saveProfile, requestDeletion } from "@/modules/account/actions";
import type { AuthFormState } from "@/modules/auth/forms";
import { brazilStates } from "@/lib/brazil";
type ProfileValues = {
  fullName: string;
  phone: string;
  oabNumber: string;
  oabState: string;
  city: string;
  legalName: string;
};
export function ProfileForm({
  values,
  email,
}: {
  values: ProfileValues;
  email: string;
}) {
  const [state, submit, pending] = useActionState(
    saveProfile,
    {} as AuthFormState,
  );
  const field = (
    key: keyof ProfileValues,
    label: string,
    type = "text",
    max = 200,
  ) => (
    <div className="form-field" key={key}>
      <label htmlFor={key}>{label}</label>
      <input
        id={key}
        name={key}
        type={type}
        defaultValue={values[key]}
        maxLength={max}
        required={["fullName", "phone", "legalName"].includes(key)}
        autoComplete={
          key === "fullName"
            ? "name"
            : key === "phone"
              ? "tel"
              : key === "city"
                ? "address-level2"
                : undefined
        }
        aria-invalid={!!state.errors?.[key]}
        aria-describedby={state.errors?.[key] ? `${key}-error` : undefined}
      />
      {state.errors?.[key] && (
        <p className="field-error" id={`${key}-error`}>
          {state.errors[key][0]}
        </p>
      )}
    </div>
  );
  return (
    <form action={submit} className="form-body">
      <h2>Dados do perfil</h2>
      <p>{email}</p>
      {state.message && (
        <p className="notice" role={state.success ? "status" : "alert"}>
          {state.message}
        </p>
      )}
      <fieldset disabled={pending} className="plain-fieldset">
        <div className="form-grid">
          {field("fullName", "Nome completo")}
          {field("phone", "Celular com DDD", "tel", 30)}
          {field("legalName", "Escritório ou empresa")}
          {field("city", "Cidade", "text", 120)}
          {field("oabNumber", "Número da OAB (opcional)", "text", 30)}
          <div className="form-field">
            <label htmlFor="oabState">UF da OAB</label>
            <select
              id="oabState"
              name="oabState"
              defaultValue={values.oabState}
            >
              <option value="">Selecione</option>
              {brazilStates.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
            <small>
              Departamento jurídico pode deixar a OAB e a UF vazias.
            </small>
          </div>
        </div>
        <button className="button" type="submit">
          {pending ? "Salvando…" : "Salvar dados"}
        </button>
      </fieldset>
    </form>
  );
}
export function DeletionForm({ requested }: { requested: string | null }) {
  const [state, submit, pending] = useActionState(
    requestDeletion,
    {} as AuthFormState,
  );
  return (
    <form action={submit} className="form-body">
      <h2>Exclusão da conta</h2>
      <p>
        Você pode solicitar a exclusão. Os dados necessários para obrigações
        legais e defesa de direitos serão preservados pelo período aplicável. O
        responsável informará a conclusão da análise.
      </p>
      {(state.message || requested) && (
        <p
          className="notice"
          role={state.success || requested ? "status" : "alert"}
        >
          {state.message ?? "Seu pedido de exclusão já está registrado."}
        </p>
      )}
      {!requested && (
        <>
          <label className="check-option">
            <input
              type="checkbox"
              name="confirm"
              value="yes"
              required
              aria-describedby={
                state.errors?.confirm ? "deletion-error" : undefined
              }
            />
            Desejo registrar um pedido de exclusão da minha conta.
          </label>
          {state.errors?.confirm && (
            <p className="field-error" id="deletion-error">
              {state.errors.confirm[0]}
            </p>
          )}
          <button
            className="button button-outline"
            type="submit"
            disabled={pending}
          >
            {pending ? "Registrando…" : "Solicitar exclusão da conta"}
          </button>
        </>
      )}
    </form>
  );
}

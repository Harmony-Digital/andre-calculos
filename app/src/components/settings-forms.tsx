"use client";
import { useActionState, useState } from "react";
import {
  saveSettings,
  savePrices,
  type SettingsState,
} from "@/modules/settings/actions";
import type { SettingsValues, PriceValues } from "@/modules/settings/forms";
import { brazilStates } from "@/lib/brazil";
function Field({
  name,
  label,
  value,
  state,
  type = "text",
  help,
  required = false,
  decimal = false,
}: {
  name: string;
  label: string;
  value: string;
  state: SettingsState;
  type?: string;
  help?: string;
  required?: boolean;
  decimal?: boolean;
}) {
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        defaultValue={value}
        type={type}
        required={required}
        inputMode={
          decimal ? "decimal" : type === "number" ? "numeric" : undefined
        }
        step={type === "number" ? 1 : undefined}
        min={type === "number" ? 0 : undefined}
        aria-invalid={!!state.errors?.[name]}
        aria-describedby={
          state.errors?.[name]
            ? `${name}-error`
            : help
              ? `${name}-help`
              : undefined
        }
      />
      {help && <small id={`${name}-help`}>{help}</small>}
      {state.errors?.[name] && (
        <p className="field-error" id={`${name}-error`}>
          {state.errors[name][0]}
        </p>
      )}
    </div>
  );
}
function Notice({ state }: { state: SettingsState }) {
  return state.message ? (
    <p className="notice" role={state.success ? "status" : "alert"}>
      {state.message}
    </p>
  ) : null;
}
export function ServiceSettingsForm({ values }: { values: SettingsValues }) {
  const [state, submit, pending] = useActionState(
    saveSettings,
    {} as SettingsState,
  );
  const field = (
    name: keyof SettingsValues,
    label: string,
    type = "text",
    help?: string,
  ) => (
    <Field
      key={name}
      name={name}
      label={label}
      value={values[name] ?? ""}
      state={state}
      type={type}
      help={help}
      required={type === "number" || type === "time"}
    />
  );
  return (
    <form
      action={submit}
      className="form-body settings-form"
      aria-label="Dados e condições do serviço"
    >
      <input type="hidden" name="revision" value={values.revision} />
      <Notice state={state} />
      <fieldset disabled={pending} className="plain-fieldset">
        <legend>Responsável técnico</legend>
        <p>
          Informe os quatro dados juntos. A identificação aparecerá no site e
          nas propostas.
        </p>
        <div className="form-grid">
          {field("technicalName", "Nome completo do responsável")}
          {field("crcNumber", "Número do CRC")}
          <div className="form-field">
            <label htmlFor="crcState">UF do CRC</label>
            <select
              id="crcState"
              name="crcState"
              defaultValue={values.crcState}
            >
              <option value="">Selecione</option>
              {brazilStates.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </select>
            {state.errors?.crcState && (
              <p className="field-error">{state.errors.crcState[0]}</p>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="crcCategory">Categoria profissional</label>
            <select
              id="crcCategory"
              name="crcCategory"
              defaultValue={values.crcCategory}
            >
              <option value="">Selecione</option>
              <option>Contador</option>
              <option>Técnico em Contabilidade</option>
            </select>
            {state.errors?.crcCategory && (
              <p className="field-error">{state.errors.crcCategory[0]}</p>
            )}
          </div>
        </div>
        <h3>Contato e pagamento</h3>
        <div className="form-grid">
          {field("contactEmail", "E-mail de contato", "email")}
          {field("contactPhone", "Celular de contato", "tel")}
          {field(
            "pixKey",
            "Chave Pix",
            "text",
            "O cadastro da chave não confirma pagamentos nem ativa cobrança automática.",
          )}
        </div>
        <h3>Prazos e complexidade</h3>
        <div className="form-grid">
          {field("slackDays", "Folga processual (dias úteis)", "number")}
          {field("quoteValidDays", "Validade da proposta (dias)", "number")}
          {field(
            "wageThreshold",
            "Complexidade alta a partir de quantas verbas?",
            "number",
          )}
          {field(
            "pageThreshold",
            "Complexidade alta acima de quantas páginas?",
            "number",
          )}
          {field(
            "claimantThreshold",
            "Complexidade alta acima de quantos reclamantes?",
            "number",
          )}
        </div>
        <h3>Horários dos avisos</h3>
        <p>Horários em Brasília. O envio depende dos canais configurados.</p>
        <div className="form-grid">
          {field("morningTime", "Primeiro horário", "time")}
          {field("eveningTime", "Segundo horário", "time")}
        </div>
        <h3>Janela dos lembretes de prazo</h3>
        <p>
          Horário de Brasília, do início até antes do fim. O calendário precisa
          ser conferido antes da ativação dos lembretes.
        </p>
        <div className="form-grid">
          {field("deadlineWindowStart", "Início dos lembretes", "time")}
          {field("deadlineWindowEnd", "Fim dos lembretes", "time")}
        </div>
        <h3>Condições e garantia</h3>
        <p>
          Estes textos serão usados nas novas propostas. Termos e política
          mantêm sua aprovação separada.
        </p>
        <div className="form-grid">
          {(
            [
              ["conditions", "Condições da proposta"],
              ["guarantee", "Texto de garantia"],
            ] as const
          ).map(([name, label]) => (
            <div className="form-field form-wide" key={name}>
              <label htmlFor={name}>{label}</label>
              <textarea
                id={name}
                name={name}
                defaultValue={values[name]}
                maxLength={4000}
                rows={5}
                aria-invalid={!!state.errors?.[name]}
              />
              {state.errors?.[name] && (
                <p className="field-error">{state.errors[name][0]}</p>
              )}
            </div>
          ))}
        </div>
        <button className="button" type="submit">
          {pending ? "Salvando…" : "Salvar configurações"}
        </button>
      </fieldset>
    </form>
  );
}
export function PriceSettingsForm({ values }: { values: PriceValues }) {
  const [example, setExample] = useState(true);
  const [state, submit, pending] = useActionState(
    async (previous: SettingsState, form: FormData) => {
      const result = await savePrices(previous, form);
      if (result.success === true) setExample(true);
      return result;
    },
    {} as SettingsState,
  );
  const field = (
    name: Exclude<keyof PriceValues, "isExample" | "approved">,
    label: string,
    amount = true,
  ) => (
    <Field
      key={name}
      name={name}
      label={label}
      value={values[name]}
      state={state}
      required
      type={amount ? "text" : "number"}
      decimal={amount}
    />
  );
  return (
    <form
      action={submit}
      className="form-body settings-form"
      aria-label="Tabela de preços"
      onReset={(event) => event.preventDefault()}
    >
      <input
        type="hidden"
        name="expectedVersion"
        value={values.expectedVersion}
      />
      <Notice state={state} />
      <fieldset disabled={pending} className="plain-fieldset">
        <legend>Uma versão a cada alteração</legend>
        <p>
          Informe os valores em reais, como 150,00. A tabela ativada e seus
          itens permanecem no histórico.
        </p>
        <div className="form-grid">
          {field("initial", "Cálculo inicial (R$)")}
          {field("liquidation", "Liquidação (R$)")}
          {field("challenge", "Impugnação (R$)")}
          {field("update", "Atualização (R$)")}
        </div>
        <h3>Adicionais</h3>
        <div className="form-grid">
          {field("perWage", "Verba adicional (R$)")}
          {field("includedWages", "Verbas incluídas", false)}
          {field("perContractMonth", "Mês contratual adicional (R$)")}
          {field(
            "includedContractMonths",
            "Meses contratuais incluídos",
            false,
          )}
          {field("perTimecardUnit", "Digitação de cartão (R$)")}
          <div className="form-field">
            <label htmlFor="timecardUnit">Unidade da digitação</label>
            <select
              id="timecardUnit"
              name="timecardUnit"
              defaultValue={values.timecardUnit}
            >
              <option value="month">Mês</option>
              <option value="page">Página</option>
            </select>
          </div>
          {field("perExtraClaimant", "Reclamante adicional (R$)")}
          {field("urgency", "Adicional de urgência (%)")}
        </div>
        <h3>Prazo padrão por complexidade</h3>
        <div className="form-grid">
          {field("simpleDays", "Simples (dias úteis)", false)}
          {field("mediumDays", "Média (dias úteis)", false)}
          {field("highDays", "Alta (dias úteis)", false)}
        </div>
        <label className="check-option">
          <input
            type="checkbox"
            name="isExample"
            value="yes"
            checked={example}
            onChange={(event) => setExample(event.target.checked)}
          />
          Esta é uma tabela de exemplo, sem uso comercial.
        </label>
        {!example && (
          <label className="check-option">
            <input type="checkbox" name="approved" value="yes" required />
            Confirmo que o André validou estes valores e prazos para ativação.
          </label>
        )}
        {state.errors?.approved && (
          <p className="field-error">{state.errors.approved[0]}</p>
        )}
        <button className="button" type="submit">
          {pending
            ? "Salvando…"
            : example
              ? "Salvar exemplo inativo"
              : "Salvar e ativar nova versão"}
        </button>
      </fieldset>
    </form>
  );
}

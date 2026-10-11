import { getConfiguration } from "@/modules/settings/queries";
import {
  ServiceSettingsForm,
  PriceSettingsForm,
} from "@/components/settings-forms";
import { priceParameterSchema } from "@/modules/settings/forms";
import { randomUUID } from "node:crypto";
import { DeliveryPolicyForm } from "@/components/delivery-policy-form";
const reais = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value / 100,
  );
export default async function Configuration() {
  const { values, priceValues, history, deliveryPolicy, role } =
    await getConfiguration();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Gestão do serviço</span>
          <h1>Configurações</h1>
          <p>Dados profissionais, condições e histórico de preços.</p>
        </div>
      </div>
      <nav className="settings-nav" aria-label="Seções de configuração">
        <a className="text-link" href="#dados">
          Dados e condições
        </a>
        <a className="text-link" href="#precos">
          Tabela de preços
        </a>
        {role === "calculator" && (
          <a className="text-link" href="#entregas">
            Liberação das entregas
          </a>
        )}
        <a className="text-link" href="#historico">
          Histórico
        </a>
      </nav>
      <section className="panel" id="dados" aria-labelledby="titulo-dados">
        <div className="panel-header">
          <h2 id="titulo-dados">Dados e condições do serviço</h2>
        </div>
        <ServiceSettingsForm values={values} />
      </section>
      <section className="panel" id="precos" aria-labelledby="titulo-precos">
        <div className="panel-header">
          <h2 id="titulo-precos">Tabela de preços</h2>
        </div>
        <PriceSettingsForm values={priceValues} />
      </section>
      {role === "calculator" && (
        <section
          className="panel"
          id="entregas"
          aria-labelledby="titulo-entregas"
        >
          <div className="panel-header">
            <h2 id="titulo-entregas">Liberação das próximas entregas</h2>
          </div>
          <DeliveryPolicyForm
            revision={Number(values.revision)}
            current={deliveryPolicy}
            requestId={randomUUID()}
          />
        </section>
      )}
      <section
        className="panel"
        id="historico"
        aria-labelledby="titulo-historico"
      >
        <div className="panel-header">
          <h2 id="titulo-historico">Histórico de versões</h2>
        </div>
        <ul className="price-history">
          {history.map((row) => {
            const parsed = priceParameterSchema.safeParse(row.parameters);
            return (
              <li key={row.id}>
                <details>
                  <summary>
                    Versão {row.version} ·{" "}
                    {row.active
                      ? "Ativa"
                      : row.is_example
                        ? "Exemplo inativo"
                        : "Histórica"}
                  </summary>
                  <p>
                    Criada em{" "}
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(row.created_at))}
                  </p>
                  {parsed.success ? (
                    <dl className="review-grid">
                      {(
                        [
                          ["initial", "Inicial"],
                          ["liquidation", "Liquidação"],
                          ["challenge", "Impugnação"],
                          ["update", "Atualização"],
                        ] as const
                      ).map(([code, label]) => (
                        <div key={code}>
                          <dt>{label}</dt>
                          <dd>{reais(parsed.data.base[code])}</dd>
                        </div>
                      ))}
                      <div>
                        <dt>Urgência</dt>
                        <dd>{parsed.data.urgencyBasisPoints / 100}%</dd>
                      </div>
                      <div>
                        <dt>Prazo simples / médio / alto</dt>
                        <dd>
                          {parsed.data.businessDays.simple} /{" "}
                          {parsed.data.businessDays.medium} /{" "}
                          {parsed.data.businessDays.high} dias úteis
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p>
                      Referência inicial sem parâmetros comerciais cadastrados.
                    </p>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

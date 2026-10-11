import { getConfiguration } from "@/modules/settings/queries";
import {
  ServiceSettingsForm,
  PriceSettingsForm,
} from "@/components/settings-forms";
import { priceParameterSchema } from "@/modules/settings/forms";
import { randomUUID } from "node:crypto";
import { DeliveryPolicyForm } from "@/components/delivery-policy-form";
import { NotificationPreferenceForm } from "@/components/notification-preferences";
import { getNotificationPreferences } from "@/modules/notifications/queries";
import { notificationEvents } from "@/modules/notifications/preferences";
const reais = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value / 100,
  );
export default async function Configuration() {
  const { values, priceValues, history, deliveryPolicy, role } =
    await getConfiguration();
  const notifications =
    role === "calculator" ? await getNotificationPreferences() : null;
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
          <a className="text-link" href="#avisos">
            Preferências de aviso
          </a>
        )}
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
      {notifications && (
        <section className="panel" id="avisos" aria-labelledby="titulo-avisos">
          <div className="panel-header">
            <h2 id="titulo-avisos">Preferências de aviso</h2>
          </div>
          <div className="form-body">
            <p>
              E-mail começa ligado e WhatsApp começa desligado. A escolha vale
              para novas ocorrências: desligar não cancela avisos já
              enfileirados; ligar não recupera avisos anteriores.
            </p>
            <p className="field-help">
              Os avisos usam os contatos do serviço. A disponibilidade de cada
              canal depende da configuração de envio.
            </p>
            {notifications.context.canClaim && (
              <p className="notice">
                Ao salvar, este perfil passa a controlar os avisos enviados
                pelos contatos do serviço.
              </p>
            )}
            {!notifications.context.isRecipient &&
              !notifications.context.canClaim && (
                <p role="status" className="notice">
                  É preciso confirmar o responsável pelos avisos antes de
                  configurar os canais.
                </p>
              )}
            <ul className="notification-events">
              {Object.entries(notificationEvents).map(([event, label]) => (
                <li key={event}>
                  <h3>{label}</h3>
                  <div className="notification-channels">
                    {notifications.preferences
                      .filter((pref) => pref.event === event)
                      .map((preference) => (
                        <NotificationPreferenceForm
                          key={preference.channel}
                          preference={preference}
                          requestId={randomUUID()}
                          canEdit={
                            notifications.context.isRecipient ||
                            notifications.context.canClaim
                          }
                        />
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
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

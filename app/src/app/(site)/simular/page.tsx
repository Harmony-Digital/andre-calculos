import Link from "next/link";
import { getPublicServiceInfo } from "@/modules/settings/queries";
import { getPublicPriceTable } from "@/modules/simulator/queries";
import { SimulatorForm } from "@/modules/simulator/form";
import "@/modules/simulator/simulator.css";
import { simulatorStyles as styles } from "@/modules/simulator/styles";
export const metadata = { title: "Simular orçamento | Portal de Cálculos" };
export default async function SimulatorPage() {
  const [table, info] = await Promise.all([
    getPublicPriceTable(),
    getPublicServiceInfo(),
  ]);
  const identified = Boolean(
    info?.technical_name?.trim() &&
    info?.crc_number?.trim() &&
    info?.crc_state?.trim() &&
    info?.crc_category?.trim(),
  );
  return (
    <main id="conteudo" className={styles.page}>
      <div className="container">
        <div className={styles.intro}>
          <span className="eyebrow">Antes do checklist completo</span>
          <h1>Uma estimativa para seu próximo passo.</h1>
          <p>
            Conheça o valor do serviço a partir das informações do trabalho. A
            proposta final vem depois do checklist completo.
          </p>
          {identified && (
            <p className={styles.professional}>
              {info!.technical_name} · CRC {info!.crc_state} {info!.crc_number}{" "}
              · {info!.crc_category}
            </p>
          )}
        </div>
        {table && identified ? (
          <SimulatorForm table={table} />
        ) : (
          <section className="legal-card" aria-label="Simulador em validação">
            <h2>O simulador está em validação.</h2>
            <p>
              A tabela de preços e a identificação profissional precisam estar
              confirmadas para disponibilizar a estimativa.
            </p>
            <p>
              <Link className="button" href="/cadastro">
                Solicitar pelo checklist completo
              </Link>
            </p>
            <Link className="text-link" href="/demonstracao/simulador">
              Conhecer a demonstração com preços fictícios
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

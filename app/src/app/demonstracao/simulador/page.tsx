import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { demoIdentity, demoPriceTable } from "@/modules/demo/model";
import { publicPriceSchema } from "@/modules/simulator/model";
import { SimulatorForm } from "@/modules/simulator/form";
import "@/modules/simulator/simulator.css";
import { simulatorStyles as styles } from "@/modules/simulator/styles";
export const metadata = {
  title: "Simulador demonstrativo | Marco",
  robots: { index: false, follow: false },
};
export default function DemoSimulatorPage() {
  const { businessDays, complexitySettings, ...pricing } = demoPriceTable;
  void businessDays;
  void complexitySettings;
  const table = publicPriceSchema.parse(pricing);
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className={styles.page}>
        <div className="container">
          <Link className={`text-link ${styles.back}`} href="/demonstracao">
            Voltar à demonstração
          </Link>
          <div className={styles.intro}>
            <span className="eyebrow">
              {demoIdentity.brand} · Demonstração fictícia
            </span>
            <h1>Uma estimativa para seu próximo passo.</h1>
            <p>
              Experimente a estimativa de valor antes do checklist completo. Os
              campos, a identificação e os preços deste exemplo aguardam
              validação para uso comercial.
            </p>
            <p className={styles.professional}>
              {demoIdentity.professional} · {demoIdentity.crc}
            </p>
          </div>
          <SimulatorForm table={table} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

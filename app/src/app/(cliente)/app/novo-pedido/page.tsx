import { CalculationUpdateContext } from "@/components/calculation-update-context";
import { LaborChecklist } from "@/components/labor-checklist";
import { getDraft } from "@/modules/checklist/queries";
import { getComplexitySettings } from "@/modules/settings/queries";
export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ rascunho?: string }>;
}) {
  const { rascunho } = await searchParams;
  const [draft, complexitySettings] = await Promise.all([
    rascunho ? getDraft(rascunho) : Promise.resolve(undefined),
    getComplexitySettings(),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Um pedido, todas as informações</span>
          <h1>
            {draft
              ? `Continuar rascunho ${draft.code}`
              : "Novo pedido de cálculo"}
          </h1>
          <p>
            Organize os dados do processo em nove etapas. Suas respostas são
            salvas ao avançar.
          </p>
        </div>
      </div>
      {process.env.NODE_ENV !== "production" && (
        <p className="notice">
          Ambiente de desenvolvimento: use somente dados fictícios.
        </p>
      )}
      {draft?.update && (
        <CalculationUpdateContext
          context={draft.update}
          revision={draft.revision}
          allowUpload
        />
      )}
      <LaborChecklist
        key={draft?.orderId ?? "new"}
        initialDraft={draft}
        complexitySettings={complexitySettings}
      />
    </>
  );
}

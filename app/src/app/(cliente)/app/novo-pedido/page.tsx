import { LaborChecklist } from "@/components/labor-checklist";
export default function NewOrderPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Um pedido, todas as informações</span>
          <h1>Novo pedido de cálculo</h1>
          <p>Organize os dados do processo em nove etapas.</p>
        </div>
      </div>
      <p className="notice">
        Prévia local: use apenas dados fictícios. As respostas não são enviadas
        nem salvas; saindo da página, elas serão descartadas.
      </p>
      <LaborChecklist />
    </>
  );
}

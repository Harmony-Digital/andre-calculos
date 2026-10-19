import { getCalculationUpdate } from "@/modules/calculation-updates/queries";
import { CalculationUpdateContext } from "@/components/calculation-update-context";
import { getQuote } from "@/modules/quotes/queries";
import { QuoteDetail } from "@/components/quote-detail";
export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const data = await getQuote((await params).id),
    update = await getCalculationUpdate(data.proposal.orderId);
  return (
    <>
      {update && <CalculationUpdateContext context={update} panel />}
      <QuoteDetail data={data} panel />
    </>
  );
}

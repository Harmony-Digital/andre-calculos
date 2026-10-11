import { getQuote } from "@/modules/quotes/queries";
import { QuoteDetail } from "@/components/quote-detail";
export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <QuoteDetail data={await getQuote((await params).id)} panel />;
}

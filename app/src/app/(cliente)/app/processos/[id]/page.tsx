import { ProcessFolder } from "@/components/process-folder";
import { processTab } from "@/modules/processes/tabs";
export const maxDuration = 300;
export default async function Folder({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; antes?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  return (
    <ProcessFolder id={id} tab={processTab(search.aba)} before={search.antes} />
  );
}

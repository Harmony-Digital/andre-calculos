import { ProcessFolder } from "@/components/process-folder";
import { processTab } from "@/modules/processes/tabs";
export const maxDuration = 300;
export default async function Folder({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  return (
    <ProcessFolder id={id} panel tab={processTab((await searchParams).aba)} />
  );
}

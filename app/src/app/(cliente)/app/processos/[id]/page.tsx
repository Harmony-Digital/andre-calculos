import { ProcessFolder } from "@/components/process-folder";
export const maxDuration = 300;
export default async function Folder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProcessFolder id={id} />;
}

import { WorkspaceShell } from "@/components/workspace-shell";
import { requireRole } from "@/modules/auth/session";
export const dynamic = "force-dynamic";
export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole(["client"]);
  return <WorkspaceShell name={profile.full_name}>{children}</WorkspaceShell>;
}

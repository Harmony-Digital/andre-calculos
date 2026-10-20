import { WorkspaceShell } from "@/components/workspace-shell";
import { requireRole } from "@/modules/auth/session";
export const dynamic = "force-dynamic";
export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole(["calculator", "admin"]);
  return (
    <WorkspaceShell
      panel
      calculator={profile.role === "calculator"}
      name={profile.full_name}
    >
      {children}
    </WorkspaceShell>
  );
}

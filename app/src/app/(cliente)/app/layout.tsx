import { WorkspaceShell } from "@/components/workspace-shell";
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}

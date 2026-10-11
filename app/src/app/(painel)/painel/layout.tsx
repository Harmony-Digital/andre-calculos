import { WorkspaceShell } from "@/components/workspace-shell";
export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceShell panel>{children}</WorkspaceShell>;
}

import type { Metadata } from "next";
import { DemoPortal } from "@/modules/demo/portal";
import "@/modules/demo/demo.css";

export const metadata: Metadata = {
  title: "Marco · Demonstração do portal de cálculos",
  description:
    "Demonstração navegável com marca, pessoas, preços e calendário fictícios.",
  robots: { index: false, follow: false },
};
export default function DemoPage() {
  return <DemoPortal />;
}

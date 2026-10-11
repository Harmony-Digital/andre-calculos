import Link from "next/link";
import { Scale } from "lucide-react";
export function Brand() {
  return (
    <Link
      href="/"
      className="brand"
      aria-label="Portal de Cálculos — página inicial"
    >
      <span className="brand-mark" aria-hidden="true">
        <Scale size={24} strokeWidth={1.4} />
      </span>
      <span>
        <span className="brand-title">Portal de Cálculos</span>
        <span className="brand-subtitle">Judiciais · Trabalhistas</span>
      </span>
    </Link>
  );
}

import { hostedValidationEnabled } from "@/modules/validation/environment";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({
  src: "../fonts/source-sans-3.woff2",
  variable: "--font-source-sans",
  display: "swap",
});
const serif = localFont({
  src: "../fonts/source-serif-4.woff2",
  variable: "--font-source-serif",
  display: "swap",
});
export const metadata: Metadata = {
  title: {
    default: "Cálculos judiciais com critério técnico",
    template: "%s | Portal de Cálculos",
  },
  description:
    "Solicite cálculos trabalhistas, acompanhe cada etapa e receba o cálculo, o arquivo PJe-Calc e o parecer técnico revisados pelo responsável.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={sans.variable + " " + serif.variable}>
      <body>
        <a className="skip-link" href="#conteudo">
          Ir para o conteúdo
        </a>
        {hostedValidationEnabled(process.env) && (
          <div className="validation-notice" role="note">
            Ambiente de validação · Dados, preços e identificação fictícios. Use
            somente processos de demonstração. Nenhuma cobrança é emitida.
          </div>
        )}
        {children}
      </body>
    </html>
  );
}

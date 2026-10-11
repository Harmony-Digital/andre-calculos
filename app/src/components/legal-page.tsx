import { legalVersion, legalDocuments } from "@/content/legal";
export function LegalPage({
  document,
}: {
  document: keyof typeof legalDocuments;
}) {
  const content = legalDocuments[document];
  return (
    <main id="conteudo" className="container legal">
      <span className="eyebrow">Rascunho para revisão</span>
      <h1>{content.title}</h1>
      <p className="notice">
        Documento sem vigência. A identificação do responsável e as condições
        finais ainda precisam de aprovação.
      </p>
      <p>Versão: {legalVersion}</p>
      {content.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <p>{section.text}</p>
        </section>
      ))}
      {document === "privacidade" && (
        <p>
          Referência:{" "}
          <a
            className="text-link"
            href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm"
          >
            Lei Geral de Proteção de Dados Pessoais
          </a>
          .
        </p>
      )}
    </main>
  );
}

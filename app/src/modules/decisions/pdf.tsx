import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { join } from "node:path";
import type { DecisionExport } from "./export";
import { parameterLabel, sourceLabel, isPremise, decisionDate } from "./types";
Font.register({
  family: "SourceSansReport",
  fonts: [
    {
      src: join(process.cwd(), "public/pdf-fonts/regular.woff"),
      fontWeight: 400,
    },
    {
      src: join(process.cwd(), "public/pdf-fonts/semibold.woff"),
      fontWeight: 600,
    },
  ],
});
Font.registerHyphenationCallback((word) => [word]);
// Quebras de linha visuais preservam identificadores longos sem hífens novos.
const graphemes = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
const displayText = (value: string) =>
  value.replace(/\S{41,}/gu, (word) =>
    Array.from(graphemes.segment(word), (part) => part.segment)
      .map(
        (char, index) => `${index > 0 && index % 40 === 0 ? "\n" : ""}${char}`,
      )
      .join(""),
  );
const s = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingBottom: 62,
    paddingHorizontal: 48,
    fontFamily: "SourceSansReport",
    fontSize: 10.5,
    color: "#233c36",
  },
  brand: { fontSize: 9, fontWeight: 600, color: "#49685b", marginBottom: 10 },
  title: { fontSize: 23, fontFamily: "Times-Roman", marginBottom: 10 },
  meta: { fontSize: 10, color: "#496057", marginBottom: 5 },
  intro: { marginTop: 15, marginBottom: 19, color: "#496057" },
  decision: {
    paddingTop: 14,
    marginBottom: 12,
    borderTopWidth: 0.6,
    borderTopColor: "#c9d2c7",
  },
  heading: { fontWeight: 600, fontSize: 13, marginBottom: 6 },
  label: { fontWeight: 600 },
  value: { marginBottom: 5 },
  small: { fontSize: 9, color: "#496057", marginTop: 5 },
  footer: {
    position: "absolute",
    height: 24,
    bottom: 25,
    left: 48,
    right: 48,
    fontSize: 8.5,
    color: "#496057",
    borderTopWidth: 0.5,
    borderTopColor: "#c9d2c7",
    paddingTop: 8,
  },
});
const cnj = (value: string) =>
  value.replace(
    /^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/,
    "$1-$2.$3.$4.$5.$6",
  );
export function DecisionDocument({ data }: { data: DecisionExport }) {
  return (
    <Document
      title="Registro de decisões técnicas"
      author={data.professional.name}
      subject="Registro técnico do processo"
      language="pt-BR"
    >
      <Page size="A4" wrap style={s.page}>
        <Text style={s.brand}>PORTAL DE CÁLCULOS JUDICIAIS</Text>
        <Text style={s.title}>Registro de decisões técnicas</Text>
        <Text style={s.meta}>Processo {cnj(data.process.cnj)}</Text>
        <Text style={s.meta}>
          {displayText(`${data.process.court} - ${data.process.chamber}`)}
        </Text>
        <Text style={s.meta}>
          {displayText(`Responsável técnico: ${data.professional.name}`)}
        </Text>
        <Text style={s.meta}>
          CRC {data.professional.crcState} {data.professional.crcNumber} -{" "}
          {data.professional.category}
        </Text>
        <Text style={s.meta}>
          Emitido em {decisionDate(data.generatedAt)} (horário de Brasília)
        </Text>
        <Text style={s.intro}>
          Escolhas registradas pelo responsável. Origens e páginas são
          informadas no registro. Decisões sem página nem concordância do
          cliente estão indicadas como premissas. Este documento registra
          decisões e não substitui o parecer assinado.
        </Text>
        {!data.decisions.length && <Text>Nenhuma decisão registrada.</Text>}
        {data.decisions.map((d, index) => (
          <View key={d.id} style={s.decision} wrap>
            <Text style={s.heading} minPresenceAhead={42}>
              {index + 1}. {parameterLabel(d.parameter)}
              {isPremise(d.page, d.confirmedAt) ? " - Premissa" : ""}
            </Text>
            <Text style={s.value} orphans={2} widows={2}>
              <Text style={s.label}>Valor escolhido: </Text>
              {displayText(d.value)}
            </Text>
            <Text style={s.value}>
              <Text style={s.label}>Origem informada: </Text>
              {sourceLabel(d.source)}
              {d.page ? ` - Página ${d.page}` : " - Página não informada"}
            </Text>
            <Text style={s.value} orphans={2} widows={2}>
              <Text style={s.label}>Justificativa: </Text>
              {displayText(d.rationale)}
            </Text>
            <Text style={s.small}>
              {displayText(
                `Registrado por ${d.recordedBy} em ${decisionDate(d.createdAt)}`,
              )}
            </Text>
            <Text style={s.small}>
              {d.confirmedAt
                ? displayText(
                    `Concordância registrada por ${d.confirmedBy || "Cliente"} em ${decisionDate(d.confirmedAt)}`,
                  )
                : "Concordância do cliente ainda não registrada."}
            </Text>
          </View>
        ))}
        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Registro de decisões técnicas | CRC ${data.professional.crcState} ${data.professional.crcNumber} | Página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
export async function renderDecisionPdf(data: DecisionExport) {
  return renderToBuffer(<DecisionDocument data={data} />);
}

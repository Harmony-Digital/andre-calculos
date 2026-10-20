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
import type { QuoteExport } from "./queries";
import { formatMoney } from "@/lib/utils";
Font.register({
  family: "SourceSansProposal",
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
const display = (text: string) =>
  text.replace(/\S{41,}/gu, (word) =>
    Array.from(
      new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(word),
      (part) => part.segment,
    )
      .map((char, index) => `${index && index % 40 === 0 ? "\n" : ""}${char}`)
      .join(""),
  );
export const proposalDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
export const proposalCivilDate = (value: string) =>
  value.split("-").reverse().join("/");
const s = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 65,
    paddingHorizontal: 48,
    fontFamily: "SourceSansProposal",
    fontSize: 10.5,
    color: "#233c36",
  },
  brand: { fontSize: 9, fontWeight: 600, color: "#49685b", marginBottom: 12 },
  title: { fontFamily: "Times-Roman", fontSize: 26, marginBottom: 8 },
  meta: { color: "#496057", marginBottom: 4 },
  notice: {
    marginVertical: 14,
    padding: 10,
    backgroundColor: "#eef1e9",
    fontWeight: 600,
    fontSize: 10,
  },
  heading: { fontWeight: 600, fontSize: 13, marginTop: 19, marginBottom: 9 },
  row: {
    flexDirection: "row",
    borderBottomColor: "#c9d2c7",
    borderBottomWidth: 0.5,
    paddingVertical: 9,
  },
  description: { flexGrow: 1, paddingRight: 12 },
  amount: { width: 88, textAlign: "right" },
  small: { color: "#496057", fontSize: 9, marginTop: 3 },
  total: {
    flexDirection: "row",
    paddingVertical: 13,
    borderBottomColor: "#233c36",
    borderBottomWidth: 1,
    fontSize: 17,
    fontWeight: 600,
  },
  terms: { fontSize: 10.5 },
  footer: {
    height: 24,
    position: "absolute",
    bottom: 25,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#496057",
    borderTopWidth: 0.5,
    borderTopColor: "#c9d2c7",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
export function QuoteDocument({ data }: { data: QuoteExport }) {
  const p = data.proposal,
    professional = p.professional;
  return (
    <Document
      title={`Proposta ${data.number}`}
      author={professional.name}
      language="pt-BR"
    >
      <Page size="A4" wrap style={s.page}>
        <Text style={s.brand}>PORTAL DE CÁLCULOS JUDICIAIS</Text>
        <Text style={s.title}>Proposta de serviço</Text>
        <Text style={s.meta}>{data.number}</Text>
        {data.revision && (
          <View>
            <Text style={s.meta}>Versão {data.revision.version}</Text>
            <Text style={s.notice}>
              Motivo do ajuste: {display(data.revision.reason)}
            </Text>
          </View>
        )}
        {p.mode === "fixture" && (
          <Text style={s.notice}>
            ENSAIO FICTÍCIO - SEM VALOR COMERCIAL. NÃO É UMA COBRANÇA.
          </Text>
        )}
        <Text style={s.meta}>{display(professional.name)}</Text>
        <Text style={s.meta}>
          CRC {professional.crcState} {professional.crcNumber} -{" "}
          {professional.category}
        </Text>
        <Text style={s.meta}>
          {display(`${professional.email} | ${professional.phone}`)}
        </Text>
        <Text style={s.meta}>
          Emitida em {proposalDate(p.issuedAt)} (horário de Brasília)
        </Text>
        <Text style={s.meta}>
          Válida até {proposalDate(p.validUntil)} (horário de Brasília)
        </Text>
        <Text style={s.heading} minPresenceAhead={60}>
          Serviços e valores
        </Text>
        {p.items.map((item) => (
          <View key={item.code} style={s.row} wrap={false}>
            <View style={s.description}>
              <Text>{display(item.description)}</Text>
              <Text style={s.small}>
                {item.quantity} × {formatMoney(item.unitCents)}
              </Text>
            </View>
            <Text style={s.amount}>{formatMoney(item.amountCents)}</Text>
          </View>
        ))}
        <View style={s.total} wrap={false}>
          <Text style={s.description}>Total</Text>
          <Text>{formatMoney(p.totalCents)}</Text>
        </View>
        <Text style={s.meta}>Sinal de 50%: {formatMoney(p.depositCents)}</Text>
        <Text style={s.meta}>
          Saldo na entrega: {formatMoney(p.balanceCents)}
        </Text>
        <Text style={s.heading} minPresenceAhead={60}>
          Prazo de entrega
        </Text>
        <Text style={s.meta}>
          Entrega proposta: {proposalCivilDate(p.deliveryDate)}
        </Text>
        <Text style={s.meta}>
          Prazo interno: {proposalCivilDate(p.internalDueDate)}
        </Text>
        <Text style={s.meta}>
          Vencimento processual: {proposalCivilDate(p.dueDate)}
        </Text>
        <Text style={s.small}>
          {p.mode === "fixture"
            ? "Calendário e disponibilidade fictícios, sem reserva de agenda real."
            : "Datas conforme o calendário e a disponibilidade registrados."}
        </Text>
        <Text style={s.heading} minPresenceAhead={45}>
          Condições
        </Text>
        <Text style={s.terms} orphans={2} widows={2}>
          {display(p.conditions)}
        </Text>
        <Text style={s.small}>
          Tabela {p.priceVersion} | Checklist revisão {p.checklistRevision}
        </Text>
        <View style={s.footer} fixed>
          <Text>
            {data.number} | CRC {professional.crcState} {professional.crcNumber}
            {p.mode === "fixture" ? " | Ensaio fictício" : ""}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
export async function renderQuotePdf(data: QuoteExport) {
  return renderToBuffer(<QuoteDocument data={data} />);
}

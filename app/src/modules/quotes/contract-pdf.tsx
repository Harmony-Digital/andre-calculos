import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  contractArchiveSchema,
  type ContractArchive,
} from "./contract-snapshot";
import { proposalDate, proposalCivilDate } from "./pdf";
import { formatMoney } from "@/lib/utils";

export const contractPdfRendererVersion = "contract-pdf-v1";
const display = (text: string) =>
  text.replace(/\S{41,}/gu, (word) =>
    Array.from(
      new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(word),
      (part) => part.segment,
    )
      .map((char, index) => `${index && index % 40 === 0 ? "\n" : ""}${char}`)
      .join(""),
  );
const captured = (value: string | null) =>
  value ?? "Não registrado no aceite original";
const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 94,
    paddingHorizontal: 48,
    fontFamily: "SourceSansProposal",
    fontSize: 10.5,
    color: "#233c36",
    lineHeight: 1.35,
  },
  brand: { fontSize: 9, fontWeight: 600, color: "#49685b", marginBottom: 12 },
  title: { fontFamily: "Times-Roman", fontSize: 26, marginBottom: 8 },
  meta: { color: "#496057", marginBottom: 4 },
  heading: { fontSize: 13, fontWeight: 600, marginTop: 18, marginBottom: 8 },
  field: { marginBottom: 4 },
  notice: {
    padding: 10,
    backgroundColor: "#eef1e9",
    fontWeight: 600,
    marginVertical: 12,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#c9d2c7",
    paddingVertical: 8,
  },
  description: { flexGrow: 1, paddingRight: 12 },
  amount: { width: 88, textAlign: "right" },
  small: { fontSize: 9, color: "#496057", marginTop: 3 },
  total: {
    flexDirection: "row",
    fontSize: 17,
    fontWeight: 600,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#233c36",
    marginBottom: 8,
  },
  text: { marginBottom: 8 },
  proof: { fontSize: 9, color: "#496057", marginBottom: 5 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 48,
    right: 48,
    height: 66,
    fontSize: 7.5,
    lineHeight: 1.25,
    borderTopWidth: 0.5,
    borderTopColor: "#c9d2c7",
    paddingTop: 6,
    color: "#496057",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
  },
  footerLeft: { width: "82%" },
  pageNumber: {
    position: "absolute",
    bottom: 18,
    right: 48,
    width: 74,
    height: 12,
    fontSize: 7.5,
    lineHeight: 1.25,
    textAlign: "right",
    color: "#496057",
  },
});
function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <Text style={styles.field} orphans={2} widows={2}>
      {`${label}: ${display(captured(value))}`}
    </Text>
  );
}
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.heading} minPresenceAhead={45}>
      {children}
    </Text>
  );
}
export function ContractDocument({ data }: { data: ContractArchive }) {
  const snapshot = data.snapshot,
    p = snapshot.proposal,
    person = snapshot.contractant,
    professional = p.professional;
  const date = new Date(snapshot.acceptance.acceptedAt);
  const fictional = snapshot.terms.text.startsWith(
    "CONTEÚDO SINTÉTICO SEM VIGÊNCIA.",
  );
  return (
    <Document
      title={`Contrato ${snapshot.number}`}
      author={professional.name}
      language="pt-BR"
      subject={`Registro contratual ${data.snapshotHash}`}
      keywords={contractPdfRendererVersion}
      creationDate={date}
      modificationDate={date}
    >
      <Page size="A4" wrap style={styles.page}>
        <Text style={styles.brand}>PORTAL DE CÁLCULOS JUDICIAIS</Text>
        <Text style={styles.title}>Contrato de serviço</Text>
        <Text style={styles.meta}>{snapshot.number}</Text>
        <Text style={styles.meta}>
          Aceito em {proposalDate(snapshot.acceptance.acceptedAt)} (horário de
          Brasília)
        </Text>
        {fictional && (
          <Text style={styles.notice}>
            ENSAIO FICTÍCIO - SEM VALIDADE COMERCIAL.
          </Text>
        )}
        <Heading>Responsável técnico</Heading>
        <Field label="Nome" value={professional.name} />
        <Field
          label="Registro"
          value={`CRC ${professional.crcState} ${professional.crcNumber} - ${professional.category}`}
        />
        <Field label="E-mail" value={professional.email} />
        <Field label="Telefone" value={professional.phone} />
        <Heading>Contratante</Heading>
        {person.source === "legacy" && (
          <Text style={styles.notice}>
            O aceite original não registrou a identificação completa do
            contratante. Os campos ausentes permanecem indicados abaixo.
          </Text>
        )}
        <Field
          label="Tipo de cadastro"
          value={
            person.kind === null
              ? null
              : person.kind === "company"
                ? "Pessoa jurídica"
                : "Pessoa física"
          }
        />
        <Field
          label={person.kind === "company" ? "Razão social" : "Nome cadastrado"}
          value={person.legalName}
        />
        <Field
          label={
            person.kind === "company"
              ? "CNPJ"
              : person.kind === "person"
                ? "CPF"
                : "CPF ou CNPJ"
          }
          value={person.document}
        />
        <Field label="Usuário que aceitou" value={person.fullName} />
        <Field label="E-mail cadastrado" value={person.email} />
        <Field label="Telefone cadastrado" value={person.phone} />
        <Field
          label="OAB"
          value={
            person.oabNumber === null
              ? null
              : `${person.oabState ?? "UF não registrada"} ${person.oabNumber}`
          }
        />
        <Heading>Serviços e valores</Heading>
        {p.items.map((item, index) => (
          <View key={`${item.code}-${index}`} wrap={false} style={styles.row}>
            <View style={styles.description}>
              <Text>{display(item.description)}</Text>
              <Text style={styles.small}>
                {item.quantity} × {formatMoney(item.unitCents)}
              </Text>
            </View>
            <Text style={styles.amount}>{formatMoney(item.amountCents)}</Text>
          </View>
        ))}
        <View style={styles.total} wrap={false}>
          <Text style={styles.description}>Total</Text>
          <Text>{formatMoney(p.totalCents)}</Text>
        </View>
        <Text style={styles.field}>
          Sinal de 50%: {formatMoney(p.depositCents)}
        </Text>
        <Text style={styles.field}>
          Saldo na entrega: {formatMoney(p.balanceCents)}
        </Text>
        <Heading>Prazos registrados</Heading>
        <Field
          label="Entrega proposta"
          value={proposalCivilDate(p.deliveryDate)}
        />
        <Field
          label="Prazo interno"
          value={proposalCivilDate(p.internalDueDate)}
        />
        <Field
          label="Vencimento processual"
          value={proposalCivilDate(p.dueDate)}
        />
        <Heading>Condições da proposta</Heading>
        <Text style={styles.text} orphans={2} widows={2}>
          {display(p.conditions)}
        </Text>
        <Text style={styles.small}>
          Tabela {p.priceVersion} | Checklist revisão {p.checklistRevision}
        </Text>
        <Heading>Termos aceitos</Heading>
        <Text style={styles.meta}>
          Versão: {display(snapshot.terms.version)}
        </Text>
        <Text style={styles.text} orphans={2} widows={2}>
          {display(snapshot.terms.text)}
        </Text>
        <Heading>Informação de privacidade aceita</Heading>
        <Text style={styles.meta}>
          Versão: {display(snapshot.privacy.version)}
        </Text>
        <Text style={styles.text} orphans={2} widows={2}>
          {display(snapshot.privacy.text)}
        </Text>
        <Heading>Registro do aceite</Heading>
        <Text style={styles.text}>
          Os serviços, valores, identificação e textos deste documento
          correspondem ao registro feito no momento do aceite. Edições
          posteriores do cadastro não alteram este histórico.
        </Text>
        <Text style={styles.proof}>
          Data: {proposalDate(snapshot.acceptance.acceptedAt)} (horário de
          Brasília)
        </Text>
        <Text style={styles.proof}>
          Identificador do usuário: {display(snapshot.acceptance.actorId)}
        </Text>
        <Text style={styles.proof}>
          Registro do aceite: {display(snapshot.acceptance.contextHash)}
        </Text>
        <Text style={styles.proof}>
          Identificador do contrato: {display(data.snapshotHash)}
        </Text>
        <Text style={styles.proof}>
          Termos: {display(snapshot.terms.sha256)}
        </Text>
        <Text style={styles.proof}>
          Privacidade: {display(snapshot.privacy.sha256)}
        </Text>
        <View fixed style={styles.footer}>
          <Text>{display(professional.name)}</Text>
          <View style={styles.footerRow}>
            <Text style={styles.footerLeft}>
              {snapshot.number} | CRC {professional.crcState}{" "}
              {professional.crcNumber} | {professional.category}
            </Text>
          </View>
        </View>
        <Text
          fixed
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => {
            return `Página ${pageNumber} de ${totalPages}`;
          }}
        >
          Página
        </Text>
      </Page>
    </Document>
  );
}
export async function renderContractPdf(input: unknown) {
  const data = contractArchiveSchema.parse(input);
  return renderToBuffer(<ContractDocument data={data} />);
}

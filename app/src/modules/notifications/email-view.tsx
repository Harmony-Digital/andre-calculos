import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";
import type { EmailContent } from "./email-content";
import type { EmailBrand } from "./email-identity";
const ink = "#192b2b";
const green = "#244b45";
const muted = "#566561";
const border = "#d9ded4";
const textStyle = {
  fontSize: "17px",
  lineHeight: "27px",
  color: ink,
  margin: "0 0 24px",
};

export function TransactionalEmail({
  content,
  brand,
  actionLabel = "Abrir portal",
  guidance = "Entre com sua conta para consultar os detalhes com segurança.",
  alternativeLinkLabel,
}: {
  content: EmailContent;
  brand: EmailBrand;
  actionLabel?: string;
  guidance?: string;
  alternativeLinkLabel?: string;
}) {
  return (
    <Html lang="pt-BR">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{content.subject}</title>
        <style>{`
          a:focus-visible { outline: 3px solid #9a4d32; outline-offset: 4px; }
          @media (max-width: 480px) {
            .email-padding { padding-left: 22px !important; padding-right: 22px !important; }
            .email-title { font-size: 29px !important; line-height: 35px !important; }
          }
        `}</style>
      </Head>
      <Preview useTitleTag={false}>{content.message}</Preview>
      <Body
        lang="pt-BR"
        style={{
          backgroundColor: "#fbfaf6",
          margin: "0",
          color: ink,
          fontFamily: "'Source Sans 3', 'Trebuchet MS', sans-serif",
          WebkitTextSizeAdjust: "100%",
        }}
      >
        <Container
          style={{ maxWidth: "600px", width: "100%", margin: "0 auto" }}
        >
          <Section
            className="email-padding"
            style={{ padding: "38px 38px 26px" }}
          >
            <Text
              style={{
                margin: "0 0 4px",
                fontFamily: "Georgia, serif",
                fontSize: "30px",
                lineHeight: "36px",
                color: green,
                letterSpacing: "-1px",
              }}
            >
              {brand.name}
            </Text>
            <Text
              style={{
                margin: "0",
                color: muted,
                fontSize: "11px",
                lineHeight: "18px",
                letterSpacing: "1.8px",
                textTransform: "uppercase",
              }}
            >
              Cálculos judiciais
            </Text>
          </Section>
          <Hr style={{ borderColor: border, margin: "0" }} />
          <Section
            className="email-padding"
            style={{ padding: "34px 38px 28px", backgroundColor: "#ffffff" }}
          >
            <main>
              <Text
                style={{
                  margin: "0 0 14px",
                  color: "#9a4d32",
                  fontSize: "12px",
                  lineHeight: "18px",
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                }}
              >
                {content.label}
              </Text>
              <Heading
                as="h1"
                className="email-title"
                style={{
                  fontFamily: "Georgia, serif",
                  fontWeight: "400",
                  fontSize: "34px",
                  lineHeight: "40px",
                  letterSpacing: "-0.8px",
                  margin: "0 0 22px",
                  color: ink,
                }}
              >
                {content.heading}
              </Heading>
              <Text style={textStyle}>{content.message}</Text>
              {content.references.length > 0 && (
                <Section
                  style={{
                    backgroundColor: "#eeeee6",
                    borderLeft: `3px solid ${green}`,
                    padding: "15px 18px 7px",
                    marginBottom: "24px",
                  }}
                >
                  {content.references.map((reference) => (
                    <Text
                      key={reference.label}
                      style={{
                        ...textStyle,
                        fontSize: "15px",
                        margin: "0 0 8px",
                      }}
                    >
                      {reference.label}: <strong>{reference.value}</strong>
                    </Text>
                  ))}
                </Section>
              )}
              <Button
                href={content.href}
                style={{
                  backgroundColor: green,
                  color: "#ffffff",
                  borderRadius: "4px",
                  padding: "16px 24px",
                  fontSize: "16px",
                  fontWeight: "700",
                  lineHeight: "20px",
                  textDecoration: "none",
                }}
              >
                {actionLabel}
              </Button>
              <Text
                style={{
                  ...textStyle,
                  color: muted,
                  fontSize: "14px",
                  lineHeight: "22px",
                  margin: "22px 0 0",
                }}
              >
                {guidance}
              </Text>
              {alternativeLinkLabel && (
                <Text
                  style={{ ...textStyle, fontSize: "14px", margin: "18px 0 0" }}
                >
                  <a href={content.href} style={{ color: green }}>
                    {alternativeLinkLabel}
                  </a>
                </Text>
              )}
            </main>
          </Section>
          <Hr style={{ borderColor: border, margin: "0" }} />
          <Section
            className="email-padding"
            style={{ padding: "24px 38px 32px" }}
          >
            <Text
              style={{
                color: muted,
                fontSize: "13px",
                lineHeight: "21px",
                margin: "0",
              }}
            >
              Responsável técnico: {brand.technicalName}
              <br />
              CRC {brand.crc} · {brand.category}
            </Text>
            {brand.demonstration && (
              <Text
                style={{
                  color: muted,
                  fontSize: "12px",
                  lineHeight: "19px",
                  margin: "12px 0 0",
                }}
              >
                Demonstração com identidade e dados fictícios.
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

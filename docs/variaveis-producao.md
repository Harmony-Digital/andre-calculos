# Variáveis da Vercel

O Fábio cadastra os valores a partir do cofre de produção, depois de conferir a conta do cliente, o time `projeto-andre1` e o projeto ligado a `Harmony-Digital/andre-calculos`. Nunca copiar valores para o repositório. Preview usa banco próprio de desenvolvimento com dados fictícios, sem apontar para a produção.

| Nome | Origem | Ambiente | Uso |
|---|---|---|---|
| `APP_BASE_URL` | App | production / preview | Origem HTTPS do ambiente, callbacks do login |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | production / preview | Projeto correspondente ao ambiente |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | production / preview | Chave pública; acesso de dados autenticado com RLS no servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | somente quando necessário | Operações de sistema no servidor; não usada nas consultas do cliente |
| `DATABASE_URL` | Supabase | somente quando necessário | Pooler, papel sem BYPASSRLS; a conexão SSR inicial usa JWT/RLS pela Data API |
| `CRON_SECRET` | Vercel | production | Autorização das rotas de cron |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | production / preview de teste | Envios após autorização e configuração de remetente |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_ALERTA`, `ALERTA_WHATSAPP_ANDRE` | WhatsApp | conforme D7 | Alertas autorizados |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_ENV` | Asaas | sandbox até GATE M3 | Pagamentos |
| `NEXT_PUBLIC_GA_ID` | Google | produção após consentimento | Analytics |
| `DATAJUD_API_KEY` | DataJud | quando integrar | Dados processuais |
| `ANTHROPIC_API_KEY` | Anthropic | quando integrar M4 | IA |

`OP_SERVICE_ACCOUNT_TOKEN` e `HUB_API_KEY` não são variáveis da aplicação nem da Vercel. A chave pública nunca substitui a sessão do usuário; chaves privilegiadas não usam prefixo `NEXT_PUBLIC_`.

Após cadastrar, validar `/api/health`, login, confirmação, recuperação de senha e isolamento entre dois usuários no destino. A existência das variáveis não comprova essas funções.

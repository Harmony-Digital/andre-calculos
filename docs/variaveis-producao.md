# Variáveis da Vercel

O Fábio cadastra os valores a partir do cofre de produção, depois de conferir a conta do cliente, o time `projeto-andre1` e o projeto ligado a `Harmony-Digital/andre-calculos`. Nunca copiar valores para o repositório. Preview usa banco próprio de desenvolvimento com dados fictícios, sem apontar para a produção.

| Nome | Origem | Ambiente | Uso |
|---|---|---|---|
| `ANDRE_VALIDATION_MODE` | Opt-in não secreto `1`, somente primeira validação autorizada | production, exclusivamente projeto/banco/domínio do manifesto de validação | Calendário/agenda fictícios, banner e geração de contratos sintéticos; não habilita provedores reais |
| `APP_BASE_URL` | App | production / preview | Origem HTTPS do ambiente, callbacks do login |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | production / preview | Projeto correspondente ao ambiente |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | production / preview | Chave pública; acesso de dados autenticado com RLS no servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | production / preview | Obrigatória para arquivos e RPCs de sistema; somente no servidor, não usada nas consultas do cliente |
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

Antes de liberar o cadastro, o Fábio confere no Auth do projeto dedicado: confirmação de e-mail obrigatória, senha mínima de 12 caracteres, Secure Email Change habilitado e SMTP próprio para os destinatários reais. Autorizar somente as origens e callbacks HTTPS do portal em produção e nos previews autorizados. Os limites ampliados de config.toml são exclusivos do Mailpit e dos testes locais.

As versões de settings precisam corresponder ao conteúdo legal aprovado e exibido pelo app. A constante que começa por rascunho e as versões de fixture não ativam cadastro em produção. Concluir a revisão e o versionamento dos textos antes de alterar isso.

## Script de cadastro (execução exclusiva do Fábio)

`scripts/sincronizar-vercel.sh` usa a conta pessoal do Fábio no 1Password e o token da conta Vercel do cliente. O agente não executa `--aplicar` nem consulta o cofre de produção. O cofre de produção é registrado somente depois da decisão D14; não há nome presumido no script.

Depois de M1.50, registrar os campos não secretos de `scripts/contas-esperadas.example` em `scripts/contas-esperadas.env`: usuário/time/IDs da Vercel, projeto, vínculo GitHub e branch `main`, origens HTTPS dos dois ambientes, projeto Supabase separado de preview, cofre de produção e e-mail pessoal do Fábio no 1Password. Conferir vínculo GitHub/branch no painel da Vercel: o JSON de `project inspect` da CLI 59.16.0 não expõe esses dois campos, portanto a conferência automática não os substitui.

O token Vercel fica no item `Vercel`, campo `VERCEL_TOKEN`, do cofre correspondente ao ambiente. Cada valor da tabela fica no item indicado, em campo com o nome exato da variável. Preview usa `proj-andre-calculos`; produção usa o cofre de pessoas registrado em `OP_COFRE_PRODUCAO`. Nada é exportado para um arquivo com valores. Os dados de destino são conferidos localmente antes do `op run`.

```bash
# Conferência apenas local; não abre o 1Password nem conecta a serviços.
bash scripts/sincronizar-vercel.sh --conferir production

# Só o Fábio executa depois das conferências e autorizações do ambiente.
bash scripts/sincronizar-vercel.sh --aplicar production
bash scripts/sincronizar-vercel.sh --aplicar preview
```

Sem nomes adicionais, o lote contém `APP_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. `DATABASE_URL` e as integrações futuras não entram no lote inicial. `CRON_SECRET`, `RESEND_API_KEY` e `EMAIL_FROM` podem ser selecionadas explicitamente ao configurar seus módulos; as quatro variáveis básicas continuam sendo carregadas só para conferir a origem e o banco do ambiente.

O script exige Vercel CLI 59.16.0 ou posterior. Usa o token apenas em ambiente de processo, limita as credenciais passadas à CLI, confere usuário/time único/IDs/projeto/diretório `app`, valida as origens e separação do Supabase, consulta metadados de variáveis existentes e envia apenas o valor atual por stdin. Não sobrescreve variáveis, não faz deploy e não imprime a saída bruta das ferramentas. Chaves privilegiadas recebem `--sensitive`; as duas variáveis `NEXT_PUBLIC_` recebem `--no-sensitive`, pois a Vercel recusa esse prefixo para Secrets. A chave pública do Supabase continua sujeita à sessão/RLS e não concede acesso administrativo.

O cadastro não é transacional. Se houver uma variável selecionada já existente, nenhuma escrita começa. Se uma falha acontecer no meio, são informados somente os nomes concluídos; não há rollback automático. Depois de revisar o destino, o Fábio seleciona somente os nomes ausentes para continuar. Variável existente não comprova valor correto; alterações desses valores ficam para revisão manual. A validação de `/api/health` e dos fluxos reais continua obrigatória.

Referências de comportamento: [variáveis na CLI da Vercel](https://vercel.com/docs/cli/env), [op run e referências de segredo](https://developer.1password.com/docs/cli/secrets-scripts). Os testes locais usam somente respostas e valores fictícios, sem autenticação, e fazem parte de `npm run check`.

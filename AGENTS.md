# AGENTS.md — guia dos agentes do Portal de Cálculos do André

> Fonte canônica de instruções para qualquer IA (Claude Code, Codex ou outra) que trabalhe neste projeto. O `CLAUDE.md` importa este arquivo: edite as regras aqui. Português do Brasil.

## 1. O projeto

O André é contador com CRC e faz cálculos judiciais, principalmente trabalhistas, no PJe-Calc. Este portal vende esse serviço a advogados:

1. o advogado se cadastra de graça;
2. responde um checklist e recebe o orçamento na hora;
3. paga 50% de entrada;
4. acompanha tudo numa pasta do processo;
5. recebe o cálculo em PDF, o .PJC e o parecer assinado.

Numa segunda fase, a IA lê o processo e prepara o trabalho para o André só validar e assinar. A construção é da Harmony Digital Hub (Fábio).

**Status atual:** sempre no `plan.md`, seção "Onde estamos". Não registre status em nenhum outro arquivo.

## 2. Ordem de leitura

1. Este arquivo.
2. `plan.md`: leia "Onde estamos", "Insumos pendentes" e "Ordem de execução"; escolha a tarefa pela regra de "Como o agente trabalha com este plano"; depois leia só a especificação dessa tarefa (seção "Especificação das tarefas"). Não é preciso ler o plano inteiro.
3. `PRD.md`: só as seções que a tarefa cita (RF, RN, stack no §11).
4. Contexto de negócio, quando precisar:
   - transcrição privada em `docs/transcricao-reuniao-2026-10-10.md` (somente local, ignorada pelo Git por decisão do Fábio);
   - [pesquisa de concorrentes](<docs/pesquisa/reports/Concorrentes cálculos judiciais advogados.md>);
   - `docs/pesquisa/research_notes/`.
5. Regras do Hub da Harmony, quando mexer na sincronização do plano:
   - `../Sistema de Gestão da Harmony Digital/AGENTS.md`, Parte B;
   - `../Sistema de Gestão da Harmony Digital/docs/plan-md.md`.

Quando a tarefa do M1 mover a transcrição e a pesquisa para `docs/`, atualize os caminhos acima.

## 3. Princípios inegociáveis

1. **A IA executa; o humano decide.** Precisam de aprovação registrada do Fábio:
   - publicar;
   - mexer em DNS ou infraestrutura;
   - enviar mensagem ou cobrança a pessoa real;
   - ligar pagamento em produção;
   - mudar escopo.
2. **Fail-closed.** Em dúvida sobre permissão, destino de banco ou identidade de conta: parar, registrar e perguntar.
3. **Não decidir pelo Fábio nem pelo André.** As decisões abertas estão no `plan.md` (D1 a D14). Use o padrão recomendado e deixe o item aberto.
4. **Evidência antes do `[x]`:** SHA, URL, saída de teste ou consulta. Trabalho parcial fica `[ ]` com "⏳" e uma nota.
5. **Contas certas, sempre conferidas.** A infraestrutura do produto fica em **contas novas do cliente**: Supabase e Vercel, criadas pelo Fábio para este projeto. O código fica na organização Harmony-Digital do GitHub, operada com a conta `fabioalmeidadigital`. O 1Password e o Hub são ferramentas da Harmony. O Fábio tem muitos outros clientes neste mesmo computador, então toda sessão confere as contas antes de agir (§7).
6. **Segredos** (senhas, chaves de API, tokens) ficam só no cofre do 1Password deste projeto (§7.1). Nunca vão para chat, git, logs, comentários, evidências ou arquivos do repositório.
7. **Uma sessão de IA por vez** no repositório.
8. **Idioma:** português do Brasil na interface, nos documentos e nos commits; inglês nos identificadores de código, tabelas e colunas.
9. **Interface:** sem emojis e sem "cara de sistema feito por IA".
10. **A IA prepara; o André decide e assina.** Nada chega ao advogado sem revisão do André (CFC, NBC PG 01, item 5(c)). A IA nunca calcula valores: ela lê, classifica, extrai e sugere. Regras de preço, prazo, estado e juros são código determinístico com testes.
11. **CRC visível:** nome, CRC e categoria do André em páginas públicas, propostas, contratos e entregas (NBC PG 01).
12. **Documentos de processo são sigilosos:**
    - ficam em buckets privados e são baixados por URL assinada curta;
    - nunca circulam por WhatsApp e nunca aparecem em logs;
    - **nunca entram dados reais** em seed, testes, fixtures ou no repositório.
13. **Unidades:** valores em centavos, datas no fuso America/Sao_Paulo e prazos processuais em dias úteis.

## 4. Protocolo de sessão

Este protocolo é o que permite parar no meio e retomar depois, em outra sessão ou com outro agente.

**Início**

1. Ler a §2 e abrir o `plan.md`. Escolher a tarefa pela "Ordem de execução": a primeira `[ ]` sem dependência aberta, que não seja de responsabilidade do Fábio ou do André nem esteja travada por insumo pendente. Se todas estiverem travadas, dizer ao Fábio exatamente o que falta e parar.
2. Rodar `git status`. Se houver mudança sem commit de uma sessão anterior, entender o que é antes de continuar; não descartar.
3. Conferir a branch: `main` só recebe merge; o trabalho vai em `feat/…`, `fix/…` ou `docs/…`.
4. Ler o **preflight de contas**, que o hook de início de sessão roda e injeta no contexto (`scripts/preflight.sh`). Resolver qualquer "PROBLEMA" antes de escrever fora do computador. Antes do primeiro uso de cada MCP na sessão, fazer a conferência dele (§7).
5. Com o Hub conectado (§10): sincronizar com pull e iniciar a tarefa.
6. Dizer em uma linha o que será feito.

**Durante**

7. Entregas pequenas: cada tarefa deve caber numa sessão. Se não couber, dividir em subtarefas no `plan.md` antes de começar.
8. Testar de verdade: no navegador (celular 375 px e computador 1440 px), com consulta ao banco ou com teste automatizado. Nada vale como verificado só por leitura de código.
9. Trabalho novo descoberto vira tarefa `[ ]` no marco certo. Não executar escopo futuro sem pedido.

**Fim** (sempre, inclusive quando a sessão vai ser interrompida no meio de uma tarefa)

10. Deixar o `npm run check` verde, quando o app existir.
11. Atualizar o `plan.md`:
    - `[x]` com `— evidência: …` só no que foi verificado;
    - o que ficou parcial continua `[ ]` com "⏳" e uma nota do que falta;
    - atualizar "Onde estamos" (próximas tarefas e o que só o Fábio destrava) e, se algum insumo chegou ou surgiu, "Insumos pendentes";
    - se a especificação de uma tarefa não bateu com a realidade (versão, API), corrigir a especificação e registrar;
    - adicionar uma linha no "Registro de Execução".
12. Fazer commit em português, com `git add` de caminhos explícitos. Push só quando o plano ou o Fábio autorizar.
13. Com o Hub conectado: sincronizar com push, informando o `commit_sha`.
14. Se algo ficou quebrado ou pela metade, dizer isso explicitamente na última mensagem.

## 5. Stack (resumo)

Detalhes, versões e justificativas no `PRD.md` §11.

| Área | Ferramentas |
|---|---|
| Aplicação | Next.js 16.4, React 19.3, TypeScript, Tailwind v4, shadcn/ui, lucide-react, Zod 4 |
| Banco, login e arquivos | Supabase Cloud na conta do cliente: projeto `qtofwbxujshroaafxowr`, região São Paulo (PostgreSQL, Auth, Storage). Só o servidor acessa o banco, pelo pooler do Supabase, com um papel sem BYPASSRLS |
| Jobs | Vercel Cron e uma fila de envios no banco (tabela `outbox`). Os jobs longos de IA são decididos no M4 |
| Integrações | Resend (e-mail, conta do cliente); WhatsApp (D7, API oficial recomendada). No M3: Asaas (pagamento, D9), GA4 e DataJud |
| Segredos | 1Password: cofre `proj-andre-calculos`, CLI `op` e contas de serviço só de leitura (§7.1) |
| IA (M4) | Claude API, `claude-opus-5-5`, via `@anthropic-ai/sdk` |
| Qualidade | Vitest, Playwright com axe, ESLint e Prettier. `npm run check` roda tudo |
| Entrega | Vercel na conta do cliente: preview a cada PR, produção pela `main`, funções na região São Paulo (gru1). O GitHub Actions roda o `npm run check` |

Estrutura planejada do repositório:

```
AGENTS.md  CLAUDE.md  PRD.md  plan.md  README.md  .mcp.json
.claude/settings.json  regras do projeto: MCPs bloqueados, comandos proibidos, hook do preflight
scripts/               preflight.sh, contas-esperadas.env, configurar-1password.sh
app/                   Next.js: src/app (rotas), src/modules/<domínio> (casos de uso), src/lib
supabase/migrations/   SQL versionado com o prefixo do projeto
docs/                  transcrição, pesquisa, manuais e decisões
worker/                (M4) jobs de PDF e IA
```

## 6. Convenções de código

- **Acesso ao banco:**
  - segredos e banco só no servidor (`import 'server-only'`); o navegador nunca fala com o banco;
  - telas e ações chamam casos de uso em `src/modules/<domínio>`, sempre com `authorize()` e registro na auditoria.
- **Migrations:**
  - DDL só por migration em `supabase/migrations/<prefixo>_NNNN_descricao.sql`;
  - pelo MCP `andre-calculos-supabase` (nunca outro), usar `apply_migration` e nunca `execute_sql` para DDL;
  - depois de cada migration, rodar `get_advisors` e registrar os achados no `plan.md`;
  - RLS em toda tabela.
- **Formulários:** um parser puro e testado lê o `FormData` e valida com Zod; erros aparecem para a pessoa com o nome do campo em português.
- **Regras de negócio** em funções puras com testes unitários: preço, prazo em dias úteis, máquina de estados e, no M5, juros e correção.
- **UI:**
  - shadcn/ui e Tailwind v4 com os tokens da marca (provisórios até D3);
  - acessível: foco visível, contraste AA e `lang="pt-BR"`.
- **Código que chama o Claude:**
  - carregar antes a skill `claude-api`;
  - modelo `claude-opus-5-5`, salvo decisão D12;
  - nunca enviar o processo inteiro (limite de 32 MB e 600 páginas por requisição); só as páginas necessárias, depois da triagem local;
  - cada campo extraído traz página e trecho.

## 7. Contas, acessos e preflight

O Fábio atende muitos clientes neste mesmo computador. O GitHub CLI tem várias contas logadas, e há MCPs de Supabase e Vercel ligados a contas de outros clientes. **Toda ação externa precisa partir da conta deste projeto.**

**Contas deste projeto**

Os valores esperados ficam em `scripts/contas-esperadas.env`, que não guarda segredos.

| Alvo | Conta ou destino deste projeto | Como confirmar | Regra |
|---|---|---|---|
| GitHub                             | conta `fabioalmeidadigital`, admin da organização Harmony-Digital; repositório público `Harmony-Digital/andre-calculos`, ID `1414349093` | `GH_TOKEN="$(gh auth token --user fabioalmeidadigital)" gh api user --jq .login` responde `fabioalmeidadigital`; `git remote get-url origin` aponta para o repositório; API confirma o ID | A conta ativa do `gh` é de outro cliente. Sempre usar o `GH_TOKEN` acima nos comandos `gh`. No `git push`, usar `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`, com o `GH_TOKEN` exportado. O MCP do GitHub está bloqueado aqui; não trabalhar no arquivo privado de ID `1413659875` |
| Supabase | MCP `andre-calculos-supabase`, restrito ao projeto `qtofwbxujshroaafxowr` (conta nova do cliente) | antes do primeiro uso na sessão: `get_project_url` responde `https://qtofwbxujshroaafxowr.supabase.co` | Só este MCP. Os MCPs `supabase`, `harmony-supabase` e `supabase-leonardo` são de outras contas e estão bloqueados. DDL só por migration |
| Vercel | MCP `andre-calculos-vercel` (conta nova do cliente); equipe esperada `Projeto Andre`, slug `projeto-andre1`, ID `team_4fdLDCsB0ROvP5ph50aFNvxm`; projeto `andre-calculos`, ID `prj_tdmzmC6utVU2fHPz0iVhroMD8NtI`, conferido no painel em 2026-10-11 | antes do primeiro uso na sessão: `list_teams` mostra só o time do cliente (`VERCEL_TEAM` em `contas-esperadas.env`); os identificadores esperados não substituem a verificação do acesso pelo MCP | O MCP da Vercel do claude.ai é de outra conta e está bloqueado. Produção só pela `main`. Variáveis de produção, só o Fábio altera |
| 1Password | conta de serviço `sa-andre-calculos-agente`, cofre `proj-andre-calculos` | o preflight confere que a conta de serviço enxerga só esse cofre | Se o `op` pedir Touch ID, é a conta pessoal do Fábio: parar |
| DNS e domínio | Registro.br, no nome do cliente (D3) | — | Nenhuma escrita sem ordem do Fábio. O MCP da Hostinger está bloqueado aqui |
| Pagamento, WhatsApp e e-mail reais | contas do cliente | — | Só sandbox e destinatários de teste até o GATE do marco. Mensagem a pessoa real exige aprovação |

**Como a conferência acontece**

1. **No início de toda sessão,** o hook `SessionStart` (`.claude/settings.json`) roda `scripts/preflight.sh`. Ele confere o GitHub, o repositório e o 1Password, e injeta o resultado no contexto. Um "PROBLEMA" significa parar e avisar o Fábio antes de qualquer escrita externa. O script também roda à mão: `bash scripts/preflight.sh`.
2. **Antes do primeiro uso de cada MCP na sessão,** o agente faz a conferência da tabela acima. Se aparecer projeto, organização ou time que não seja deste cliente, para e avisa.
3. **O `.claude/settings.json` bloqueia neste projeto:**
   - os MCPs de outras contas (`supabase`, `harmony-supabase`, `supabase-leonardo`, `claude_ai_Vercel`, `github`, `hostinger`, `lovable`);
   - os comandos que revelariam segredos (§7.1).

   Não contornar o bloqueio com outro cliente, outro nome de servidor ou chamada direta à API.
4. **Se um MCP deste projeto não estiver conectado, ou estiver na conta errada,** o Fábio refaz a conexão pelo `/mcp` do Claude Code. No login do navegador ele usa a conta nova do cliente (janela anônima ou perfil separado evita cair na conta de outro cliente). O agente não faz login no lugar dele.
5. **Valor novo confirmado** (time da Vercel, nome do projeto, domínio): registrar em `scripts/contas-esperadas.env` e nesta tabela, na mesma entrega.

Se uma proteção automática da sessão recusar uma ação, não contornar: parar e perguntar.

### 7.1 Segredos: 1Password, um cofre por projeto

Padrão da Harmony a partir de 2026-10-10: cada projeto tem seu próprio cofre no 1Password, e os agentes só enxergam o cofre do projeto em que estão trabalhando.

**Onde fica cada coisa**

| O quê | Onde |
|---|---|
| Cofre deste projeto | `proj-andre-calculos`. Mesmo nome do repositório e do schema. Não muda quando sair a marca nova |
| Itens do cofre | um item por serviço (Supabase, Vercel, Resend, WhatsApp, Asaas, Anthropic, Hub…). Os campos usam o nome da variável de ambiente (ex.: `RESEND_API_KEY`). A lista está no `PRD.md` §11.7 |
| Logins das contas do cliente e chaves de produção | **não** ficam no cofre que os agentes leem. Ficam num cofre só de pessoas (D14) |
| Referências no código | `app/.env.tpl`, versionado. Contém só referências no formato `op://proj-andre-calculos/<Item>/<CAMPO>`, nunca valores |

**Contas de serviço** (criadas pelo Fábio, com acesso definido na criação)

| Conta | Permissão | Onde fica o token | Quem usa |
|---|---|---|---|
| `sa-andre-calculos-agente` | `read_items` só no cofre do projeto | Chaves do macOS (serviço `op-sa-andre-calculos-agente`), lido na hora do comando | Claude Code e Codex no desenvolvimento |
| `sa-andre-calculos-ci` (se o CI precisar) | `read_items` | secret do GitHub Actions | `1password/load-secrets-action` |

**Produção:** os segredos ficam nas variáveis de ambiente da Vercel, na conta do cliente. Quem cadastra e atualiza é o Fábio, a partir do cofre de produção. Nenhuma conta de serviço lê segredo de produção.

Agente não cria conta de serviço, não muda permissão de cofre e não grava no cofre.

**Como o agente usa os segredos**

1. **Rodar com segredos:** `op run --env-file=app/.env.tpl -- <comando>`, de preferência pelo script `scripts/com-segredos.sh` (tarefa do M1). Os valores vão só para o ambiente do processo, e o `op run` mascara qualquer segredo impresso na saída.
2. **Proibido revelar valor:**
   - `op read`, `op item get --reveal` e `op run --no-masking`;
   - `printenv`, `echo $VAR` ou `cat` de arquivo com segredo.

   O valor iria para o histórico da conversa.
3. **Nunca gravar segredo em arquivo.** Se uma ferramenta exigir arquivo com segredo, pedir ao Fábio. O `op inject` está bloqueado para agentes, assim como `op read`, `op item get`, `printenv`, `security find-generic-password` e a leitura de `.env`, `.env.local` e `.env.production` (`.claude/settings.json`).
4. **O token da conta de serviço** (`OP_SERVICE_ACCOUNT_TOKEN`) nunca entra em `.mcp.json`, `settings`, scripts ou `.env`. Ele é lido das Chaves do macOS no momento do comando.
5. **Segredo novo ou que falta:** pedir ao Fábio. Ele cria o item no cofre; o agente só acrescenta a referência no `app/.env.tpl`.
6. **Suspeita de vazamento:** avisar o Fábio na hora. Ele revoga o token da conta de serviço, troca a chave no serviço de origem e atualiza o cofre.
7. **Contas de serviço têm limite de leituras por hora:** usar um `op run` por comando, nunca `op` dentro de laço.
8. **Senhas de pessoas** (login do André, de advogados) nunca passam por agente nem vão para o cofre do projeto.

## 8. Regras de negócio que não podem quebrar

As regras completas estão no `PRD.md` §8 (RN-01 a RN-11). As essenciais:

- **Proposta:** discrimina cada serviço e seu valor; o aceite vale como contrato.
- **Fila:** o pedido entra só com aceite e sinal confirmado, ou com cliente que tem contrato.
- **Prazo:** prometido ≤ interno ≤ vencimento processual menos a folga, sempre em dias úteis, com recesso de 20/12 a 20/01.
- **Preço:** sempre vem da tabela versionada; ajuste manual exige motivo.
- **Decisões técnicas:** cada uma tem origem, página e responsável. Decisão sem fonte aparece como "premissa".
- **Auditoria:** todo acesso a arquivo de processo fica registrado.

## 9. Definição de pronto

- Código e testes escritos, com `npm run check` verde.
- Migration aplicada e advisors sem achado crítico, quando houver banco.
- Verificação real registrada no `plan.md` (comando, URL ou consulta).
- Documentação atualizada quando uma interface pública mudar.
- Nenhum segredo, dado pessoal ou dado real de processo no repositório; nenhum emoji novo na interface.

## 10. Hub da Harmony

O projeto é gerido no Hub (`https://hub.harmonydigital.com.br`). O `plan.md` segue o formato que o Hub lê:

| No arquivo | No Hub |
|---|---|
| `## Mn — Nome` | marco |
| `### Nome` | frente |
| `- [ ] Título — nota` | tarefa |
| `### 🔒 GATE` | critérios de aceite |

**Como trabalhar com o Hub:**

1. **Até o projeto ser cadastrado** (tarefa do M1, feita pelo Fábio): o `plan.md` local é a referência.
2. **Depois do cadastro:**
   - o Hub é a fonte de verdade;
   - no início da sessão: pull e `hub_start_task`;
   - no fim da sessão: `hub_complete_task` com evidência e push com `commit_sha`.
3. **Quando houver divergência,** o Hub vence: relate a divergência em comentário em vez de "consertar".
4. **Proibido ao agente:**
   - criar marco;
   - marcar GATE;
   - mudar prazo de marco;
   - escrever texto para o cliente.

   Nesses casos, o caminho é `hub_request_approval`.
5. **Conexão:** a chave do agente fica no cofre do projeto (item "Hub") e chega ao Claude Code como `HUB_API_KEY`. Ela nunca entra no `.mcp.json`. A primeira chamada é sempre `hub_whoami`.

## 11. Arquivos do projeto

| Arquivo | O que tem |
|---|---|
| `PRD.md` | o que construir, regras, modelo de dados e stack |
| `plan.md` | marcos, tarefas, decisões abertas, onde estamos e registro de execução |
| `docs/transcricao-reuniao-2026-10-10.md` | reunião de descoberta (2026-10-10), sigilosa e somente local; nunca adicionar ao Git |
| `docs/pesquisa/reports/Concorrentes cálculos judiciais advogados.md` | pesquisa de concorrentes e recomendações |
| `docs/pesquisa/research_notes/` | notas das pesquisas |
| `app/.env.tpl` (a criar no M1) | referências `op://` para os segredos do cofre, sem valores |
| `scripts/configurar-1password.sh` | cria o cofre e a conta de serviço do agente e testa o acesso. Roda com a conta do Fábio (Touch ID); o agente não roda sem pedido dele |
| `scripts/preflight.sh` | conferência de contas no início de toda sessão (hook) ou à mão |
| `scripts/contas-esperadas.env` | contas, repositório, projeto do Supabase e time da Vercel esperados; sem segredos |
| `.mcp.json` | MCPs deste projeto: `andre-calculos-supabase` (restrito ao projeto `qtofwbxujshroaafxowr`) e `andre-calculos-vercel` |
| `.claude/settings.json` | regras versionadas: MCPs de outras contas e comandos que revelam segredos bloqueados; hook do preflight |
| `.claude/settings.local.json` | aprovação local dos MCPs do projeto (fora do git) |
| `PROJETO DO ANDRE THE ONE.m4a` | áudio original; não vai para o git |

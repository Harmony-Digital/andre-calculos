# Plano — Portal de Cálculos Judiciais do André

Nome provisório até a marca (D3).
- **Requisitos e stack:** `PRD.md`.
- **Regras de trabalho dos agentes:** `AGENTS.md`.
- **Passo a passo das tarefas:** seção "Especificação das tarefas", para o M1 e o M2. Os marcos seguintes são detalhados na tarefa `.00` de cada um, antes de começar.

## Onde estamos

- **Atualizado em:** 2026-10-11, por Codex.
- **Fase:** M1 em andamento; autenticação e arquivos privados verificados localmente, com fluxos do M2 em construção.
- **O que já existe:**
  - documentação organizada em `docs/`, Next.js 16.4/React 19.3 em `app/`, página pública, áreas provisórias do cliente e André, checklist de nove etapas e rascunhos legais;
  - motor de orçamento em centavos, calendário processual provisório, classificador e máquina de estados; 269 testes unitários aprovados, cobertura do motor de preço 100%;
  - sessão SSR com cookies HttpOnly, login/logout, papéis protegidos e pasta de documentos; navegador/axe verificados em 375 e 1440 px;
  - vinte e seis migrations locais, 24 tabelas públicas e duas tabelas internas com RLS (vínculos de anexos e recibos do índice), quatro usuários fictícios e um processo inventado; 61 testes reais de RLS aprovados e advisors locais sem achados;
  - upload TUS de 300 MiB retomado do offset de 12 MiB após interrupção da rede; SHA-256 conferido no servidor; download auditado por link de 120 s e acesso entre clientes negado;
  - pasta do processo com seis abas, quatro pastas fixas e PDF sob demanda; paginação, zoom, texto selecionável, senha efêmera e rolagem por teclado; proxy privado com HEAD/Range/206 auditado, leitura de PDF acima de 4,5 MB verificada localmente, sem URL assinada no navegador durante a visualização;
  - mensagens privadas entre cliente e calculista, anexos confirmados da pasta do cliente, nomes dos participantes, histórico paginado sem perda de microssegundos; envio idempotente e texto preservado após falha, inclusive resposta perdida depois de gravar; avisos enfileirados, sem despacho real;
  - linha do tempo com filtro antes do limite, paginação por data/UUID e notas compartilhadas com o cliente; só o calculista registra notas, com autoria inferida da sessão, idempotência e auditoria; helper interno mantém evento na mesma transação dos casos de uso;
  - decisões técnicas registradas pelo calculista com origem/página/justificativa, premissas e concordância exclusiva do cliente; registro imutável, confirmação idempotente, eventos/auditoria transacionais e PDF privado com CRC, fontes locais e paginação; ensaios em 375/1440 px e PDFs de uma/seis páginas conferidos;
  - índice de páginas por arquivo/versão com criação/edição/remoção pelo calculista, leitura do cliente, revisão otimista e recibos privados para reenvio seguro; paginação com microssegundos/UUID, fonte preservada e nova versão sem herança automática de referências;
  - fila do André ordenada pelo prazo interno/UUID, com filtro antes do limite, prazos ausentes ao final e paginação de cinquenta; destaques de atraso/dois dias úteis pelo calendário provisório e situação financeira só por pagamentos confirmados;
  - entrega conferida com PDF/PJC/parecer, complementos DOCX/XLSX e checklist explícito; confirmação transacional/idempotente, arquivos/identificação congelados, evento/auditoria e aviso enfileirado; resumo paginado sem perda de microssegundos, cliente sem bytes até política/saldo permitirem, sem decisão real de D6;
  - checklist v1 persistido como rascunho, retomado após recarga e pela lista; revisões concorrentes protegidas e outro cliente recebe 404; nenhum orçamento ou entrada na fila antes das condições comerciais;
  - configurações profissionais/comerciais auditadas, versões de preço e itens imutáveis após ativação, edição concorrente recusada; projeção pública sem Pix; limites do classificador vêm das configurações;
  - cadastro confirmado no Mailpit com versões legais sintéticas, perfil persistido, troca de senha com revogação no segundo dispositivo, exclusão solicitada sem apagar conta e aviso de cadastro enfileirado;
  - `npm run check` aprovado (269 unitários/build), 75 e2e aprovados; cinco ensaios únicos (e-mail, cadastro, edição de settings, 300 MiB e proxy acima de 4,5 MB) omitidos no projeto celular, com formulários/conta/PDF/arquivos menores/mensagens/linha do tempo/decisões/índice/entrega verificados nas duas larguras; `npm audit --omit=dev` sem achados em 2026-10-11;
  - Docker/Colima exclusivos de `andre-calculos`, sem alterar o contexto global; Supabase local PostgreSQL 17 com serviços saudáveis e Auth health HTTP 200;
  - branch `feat/fundacao-portal`; remoto `Harmony-Digital/andre-calculos` ainda vazio e sem push;
  - conexão Vercel exclusiva autenticada na equipe `Projeto Andre` (`projeto-andre1`), conta `projetoandre.harmony@gmail.com`; nenhum projeto Vercel criado;
  - MCP `andre-calculos-supabase` registrado no Codex com `project_ref=qtofwbxujshroaafxowr`; OAuth dessa conexão aguarda login na conta do cliente. As ferramentas dedicadas ainda não estão expostas nesta sessão.
- **Próximas tarefas do agente:** completar configuração/instruções da regra de liberação (M2.27), mantendo D6 aberta; preparar proposta/pedido conforme os insumos. Filtro/notas/decisões/índice/entrega da linha do tempo estão verificados; eventos dos casos de uso futuros entram ao construir cada fluxo. M2.22 tem conversa local verificada; despacho dos avisos depende de M2.28/29. M2.33 já tem telas/RPCs locais, com ligação à proposta ainda pendente. Nenhuma alteração de nuvem sem conferir a conexão dedicada.
- **Bloqueios externos:**
  - M1.10: revisão automática recusou retirar o áudio do primeiro commit sem aprovação específica do Fábio; áudio preservado e push bloqueado;
  - MCP Supabase dedicado aguarda login; planos Pro, integração GitHub/Vercel e dados reais do André ainda precisam de verificação/insumos;
  - GATEs, revisão de textos, calendário de TRT, preços e ensaios reais continuam sem evidência humana; não foram marcados como concluídos.
- **Prazo combinado com o André:** primeira versão no ar por volta de 2026-10-20 (M2).
- **Toda sessão começa pelo preflight de contas** (`scripts/preflight.sh`, `AGENTS.md` §7). Nesta execução foram confirmados GitHub `fabioalmeidadigital`, remoto e cofre exclusivo `proj-andre-calculos`.

## Como o agente trabalha com este plano

**O que ler em cada sessão:**
- "Onde estamos", "Insumos pendentes" e "Ordem de execução";
- a especificação da tarefa escolhida.

Não é preciso ler o arquivo inteiro.

**Como escolher a tarefa:** a primeira da "Ordem de execução" que atenda a tudo isto:
- está `[ ]`;
- tem as dependências concluídas;
- não é "responsável: Fábio" nem "responsável: André";
- não está travada por insumo pendente.

Se todas as disponíveis estiverem travadas, dizer ao Fábio exatamente o que falta.

**Uma tarefa por vez.** Cada tarefa cabe numa sessão. Os commits citam o ID, por exemplo: `Cria o app base (M1.30)`.

**Formato do Hub da Harmony** (regras completas em `docs/plan-md.md` do repositório do Hub):

| No arquivo | No Hub |
|---|---|
| `## Mn — Nome` | marco |
| `### Nome` | frente |
| `- [ ] M1.30 Título — nota` | tarefa |
| `### 🔒 GATE` | critérios de aceite, decididos pelo Fábio |

O título vai até o primeiro " — ". As seções "Especificação das tarefas" e "Decisões" são ignoradas pelo Hub.

**Concluir uma tarefa:**
- `[x]` só com `— evidência: …` (SHA, URL, saída de teste, consulta);
- trabalho parcial fica `[ ]` com "⏳" e uma nota do que falta.

**O agente não pode:** criar marco, marcar GATE ou mudar prazo de marco.

**Ao encerrar a sessão,** mesmo no meio de uma tarefa:
1. atualizar "Onde estamos" e, se algo chegou, "Insumos pendentes";
2. adicionar uma linha no "Registro de Execução";
3. fazer o commit.

**A partir do M3,** antes de começar cada marco, executar a tarefa `.00`: escrever a especificação de cada tarefa no mesmo formato do M1 e do M2, e pedir a aprovação do Fábio.

**Especificação que não bate com a realidade** (versão de biblioteca, API que mudou): corrigir a especificação na mesma entrega e registrar no Registro de Execução.

## Insumos pendentes

| Insumo | De quem | Trava | Situação |
|---|---|---|---|
| Aprovar os MCPs `andre-calculos-supabase` e `andre-calculos-vercel` e fazer o login com as contas novas | Fábio | M1.04, migrations na nuvem, M1.50 | pendente |
| Decidir o áudio da reunião no primeiro commit | Fábio | M1.12 (push) | pendente |
| Runtime Docker local (D17) | Agente, conforme execução integral autorizada | M1.40 a M1.44 | Colima 0.10.3 e Docker 29.9.0 instalados; perfil andre-calculos saudável; decisão de produto D17 permanece aberta |
| Confirmar a região São Paulo e assinar o plano Pro no Supabase e na Vercel, com o cartão do cliente | Fábio | M1.05, M1.44, M1.50 | pendente |
| Instalar o app da Vercel do cliente na organização Harmony-Digital do GitHub, só com acesso a `andre-calculos` | Fábio | M1.50 | pendente |
| Confirmar se as contas do Supabase e da Vercel foram criadas com a conta-mãe (Gmail novo do cliente) | Fábio | M1.06 | a confirmar |
| Conta no Resend | Fábio | M2.28 | pendente |
| Cadastrar o projeto no Hub e criar a chave do agente | Fábio | M1.60, M1.61 | pendente |
| Decisões D7, D14, D16 e D17 | Fábio | ver "Decisões" | pendente |
| Nome completo, número do CRC (UF e categoria) e CPF ou CNPJ e razão social que aparecem no site e nas propostas | André | publicação de M2.02, M2.03 e M2.12 | pendente |
| Respostas do formulário de marca: nome e domínio (D3) | André | domínio do e-mail (M2.28) e M2.37 | pendente |
| Tabela de preços, adicionais, prazo padrão, folga e percentual de urgência (D10) | André | valores reais de M2.09 e M2.33 | pendente |
| Validação dos campos do checklist (RF-20) | André | fechamento de M2.08 | pendente |
| Chave Pix e dados para o sinal | André | M2.16 | pendente |
| Número de WhatsApp para os alertas (D7) | André | M2.29 | pendente |
| Decisões D5, D6, D8 e D11 | André | M2.13, M2.27, M2.10 | pendente |
| Aprovação dos textos da página inicial, dos termos e da política | André | GATE M2 | pendente |
| Um processo antigo, com autorização, para o ensaio | André | M2.36 | pendente |

## Ordem de execução (M1 e M2)

1. **Já dá para fazer (agente):** M1.11 → M1.30 → M1.31 → M1.32 → M2.19 → M2.09 → M2.10 → M2.11 → M2.08 (interface e schema, ainda sem salvar) → M2.02 (com marcadores no lugar dos dados do André) → M2.03 (rascunho).
2. **Depois de M1.10 (áudio):** M1.12 → M1.13.
3. **Depois de M1.03 (MCPs):** M1.04 → M1.05.
4. **Depois de M1.08 (Docker):** M1.40 → M1.41 → M1.42 → M1.43 → M1.44 → M1.22.
5. **Depois de M1.50 (Vercel ligada ao GitHub):** M1.51 → M1.52 → M1.23 (Fábio) → GATE M1.
6. **M2 com banco:** M2.04 → M2.05 → M2.06 → M2.33 → M2.12 → M2.14 → M2.15 → M2.16 → M2.17 → M2.18 → M2.20 → M2.21 → M2.22 → M2.23 → M2.24 → M2.25 → M2.26 → M2.26a → M2.27 → M2.13 → M2.32.
7. **Notificações:**
   - M2.28 precisa da conta no Resend (e do domínio, para produção);
   - M2.29 precisa de D7;
   - depois, M2.30 → M2.31.
8. **Fechamento:** M2.34 → M2.35 → M2.36 → M2.37 → GATE M2.

## M1 — Fundação técnica

Prazo sugerido: 2026-10-13

### Contas e conexões

- [x] M1.01 Criar as contas do cliente no Supabase e na Vercel — evidência: criadas pelo Fábio em 2026-10-10; projeto do Supabase `qtofwbxujshroaafxowr`
- [x] M1.02 Conectar o projeto às contas certas e bloquear as contas de outros clientes — evidência: `.mcp.json` com `andre-calculos-supabase` (restrito ao projeto `qtofwbxujshroaafxowr`) e `andre-calculos-vercel`; `.claude/settings.json` bloqueia os MCPs de outras contas e os comandos que revelam segredos (bloqueio testado com `printenv` em 2026-10-10); hook `SessionStart` roda `scripts/preflight.sh` (testado: GitHub, repositório e 1Password OK)
- [ ] M1.03 Aprovar os MCPs do projeto e fazer o login com as contas novas do cliente — ⏳ OAuth Vercel autorizado na equipe Projeto Andre; Supabase dedicado aguardando login do Fábio
- [ ] M1.04 Conferir os dois MCPs e registrar os identificadores do cliente — depende de M1.03
- [ ] M1.05 Confirmar a região e o plano do Supabase e da Vercel — responsável: Fábio confirma no painel; o agente registra
- [ ] M1.06 Confirmar a conta-mãe do cliente e guardar o acesso no cofre só de pessoas — responsável: Fábio; D16
- [ ] M1.07 Criar a conta no Resend com a conta-mãe — responsável: Fábio
- [ ] M1.08 Instalar o OrbStack ou o Docker Desktop para o Supabase local — responsável: Fábio; D17

### Repositório e organização

- [ ] M1.10 Tirar o áudio da reunião do primeiro commit antes do push — responsável: Fábio decide, agente executa
- [x] M1.11 Organizar a pasta do projeto — evidência: transcrição e pesquisas movidas preservando o conteúdo; README e referências atualizados; 13 documentos conferidos, zero links locais quebrados (2026-10-11)
- [ ] M1.12 Fazer o primeiro push para Harmony-Digital/andre-calculos — depende de M1.10
- [ ] M1.13 Criar o CI de qualidade e proteger a main — ⏳ workflow local preparado; falta primeiro push, proteção da main e execução real do CI

### Segredos (1Password)

- [x] M1.20 Criar o cofre proj-andre-calculos e a conta de serviço do agente com leitura só nesse cofre — evidência: `scripts/configurar-1password.sh` rodou em 2026-10-10 com aprovação do Fábio; o cofre já existia, a conta `sa-andre-calculos-agente` foi criada com `read_items`, o token está nas Chaves do macOS (`op-sa-andre-calculos-agente`) e o teste mostrou que a conta enxerga só `proj-andre-calculos`
- [ ] M1.21 Cadastrar no cofre os itens de cada serviço quando ele for configurado — responsável: Fábio
- [ ] M1.22 Criar o app/.env.tpl e o script scripts/com-segredos.sh — ⏳ referências e scripts criados, bash -n aprovado; dev-env injeta apenas chaves locais em memória, sem .env; falta ensaio op run com os itens de M1.21
- [ ] M1.23 Cadastrar as variáveis de produção na Vercel — ⏳ lista em docs/variaveis-producao.md preparada; script e cadastro pelo Fábio pendentes
- [x] M1.24 Configurar segredos no CI se algum job precisar — evidência: não necessário em 2026-10-11; workflow sobe Supabase local e gera credenciais fictícias em memória, sem segredos de produção

### Aplicação base

- [x] M1.30 Criar o app Next.js 16.4 em app/ — evidência: Next 16.4.0, React 19.3.0, Node 22; npm run check aprovado em 2026-10-11
- [x] M1.31 Criar a base visual provisória do site, da área do cliente e do painel — evidência: Playwright/axe aprovado em 375/1440 px; navegação e ausência de overflow verificadas em 2026-10-11
- [x] M1.32 Criar a rota de saúde com o SHA do commit — evidência: dois testes unitários e GET real via Playwright aprovados; SHA/região Vercel e fallback local verificados

### Banco, autenticação e arquivos

- [x] M1.40 Montar o Supabase local com dados fictícios — evidência: scripts/seed-dev.ts cria quatro usuários @exemplo.com e processo inventado; 16 consultas/testes de RLS locais aprovados em 2026-10-11
- [x] M1.41 Ligar o app ao Supabase com @supabase/ssr — evidência: páginas server leem perfil real; testes e2e confirmam cookies HttpOnly e ausência de tokens acessíveis ao JavaScript em 2026-10-11
- [ ] M1.42 Criar as migrations iniciais com RLS — ⏳ onze migrations locais aplicadas, 24 testes de RLS aprovados, advisors segurança/desempenho e db lint sem achados; falta aplicar/verificar na nuvem pela conexão dedicada
- [x] M1.43 Configurar o login e os papéis cliente, calculista e admin — evidência: e2e login/logout/acesso negado em 375/1440 px aprovados; Auth verifica getUser e profiles.role, sem confiar no papel em metadata (2026-10-11)
- [ ] M1.44 Configurar os buckets privados com upload retomável e URL assinada curta — ⏳ bucket local privado; ensaio real de 314572800 bytes retomou de 12582912 bytes, hash confirmado; download auditado/120 s e cliente B negado em ambas telas; falta configurar e verificar limite Pro na nuvem

### Publicação e operação

- [ ] M1.50 Criar o projeto na Vercel ligado ao repositório e publicar a produção — responsável: Fábio liga a integração; o agente configura
- [ ] M1.51 Criar a fila de envios no banco e o Vercel Cron — depende de M1.42 e M1.50
- [ ] M1.52 Confirmar o backup diário do banco e documentar a restauração — depende de M1.05

### Gestão no Hub

- [ ] M1.60 Cadastrar o projeto no Hub e importar este plano — responsável: Fábio
- [ ] M1.61 Conectar o Claude Code ao MCP do Hub — depende de M1.60

### 🔒 GATE M1 (aprovação do Fábio)

- [ ] Os MCPs do Supabase e da Vercel conferidos nas contas do cliente, e o preflight sem problemas
- [ ] Repositório no GitHub com CI verde
- [ ] App em produção na Vercel (região São Paulo) com `/api/health` mostrando o SHA
- [ ] Login funcionando e acesso negado testado entre dois clientes
- [ ] Upload de PDF grande funcionando direto para bucket privado
- [ ] Backup diário do banco ativo e restauração documentada
- [ ] Nenhum segredo fora do 1Password, e a conta de serviço do agente só enxerga o cofre `proj-andre-calculos`

## M2 — Portal comercial no ar (MVP)

Prazo sugerido: 2026-10-20

### Marca e site público

- [ ] M2.01 Preparar o formulário de marca e gerar as opções de nome — ⏳ formulário com 15 perguntas em docs/marca/formulario.md; aguardando respostas para propor nomes e verificar domínios
- [ ] M2.02 Criar a página inicial — ⏳ prévia responsiva e axe aprovados; falta identidade/CRC, tabela ativa, textos de garantia e aprovação do André
- [ ] M2.03 Escrever os termos de uso e a política de privacidade versão 1 — ⏳ rascunhos versionados e páginas locais verificadas; falta revisão jurídica, dados reais e registro de aceite em consents

### Cadastro e conta

- [ ] M2.04 Criar o cadastro e o login do cliente — ⏳ RF-10 implementado e e2e de confirmação Mailpit/login aprovado com dados e aceites sintéticos; CPF/CNPJ numérico e alfanumérico, E.164 e OAB/UF validados; cadastro público ainda bloqueado até conteúdo legal aprovado e Auth/SMTP de produção conferidos
- [x] M2.05 Avisar o André a cada novo cadastro — evidência: e2e confirmou notificação new_signup na fila local, com nome/OAB/cidade e sem documento; destino configurado e preferências respeitados; envio real depende de M2.28/29 (2026-10-11)
- [x] M2.06 Criar a página da conta com perfil, senha e pedido de exclusão — evidência: três fluxos e axe em 375/1440 px aprovados; perfil por RPC auditada, senha nova funciona e segundo dispositivo perde acesso; pedido idempotente preserva conta/retenção (17 testes RLS, 2026-10-11)

### Checklist e orçamento

- [ ] M2.07 Receber do André a tabela de preços e os prazos — ⏳ questionário em docs/precos/questionario.md e tabela de exemplo local inativa preparados; respostas e ativação da tabela real pelo André pendentes
- [ ] M2.08 Criar o checklist trabalhista em etapas com schema versionado — ⏳ schema v1/CNJ, nove etapas persistidas, retomada e revisão concorrente verificados em 375/1440 px e 19 testes RLS; imagens em docs/evidencias/checklist; falta validação dos campos pelo André
- [x] M2.09 Criar o motor de preço determinístico — evidência: testes de base/adicionais/urgência/arredondamento/limites; 100% das linhas e branches de pricing.ts executados em 2026-10-11
- [ ] M2.10 Criar a calculadora de prazo processual em dias úteis — ⏳ calendário/folga e testes Carnaval/Páscoa/20-11/recesso aprovados; fontes em docs/calendario-processual.md; falta calendário oficial do TRT e conferência de três casos pelo André
- [x] M2.11 Criar o classificador de complexidade — evidência: testes por regra e limites configuráveis; painel salva os limites por RPC auditada e checklist os carrega por projeção mínima protegida; 24 testes RLS aprovados (2026-10-11)
- [ ] M2.12 Criar a tela de orçamento e o PDF da proposta — RF-22 e RF-23
- [ ] M2.13 Criar o caminho Só o PDF com taxa de triagem — RF-24; D5
- [ ] M2.14 Avisar o André a cada orçamento gerado — RF-25

### Pedido, upload e pagamento

- [ ] M2.15 Registrar o aceite eletrônico da proposta — RF-30
- [ ] M2.16 Criar o pagamento manual do sinal com confirmação do André — RF-31
- [ ] M2.17 Permitir marcar cliente com contrato — RF-32
- [ ] M2.18 Criar o upload retomável de documentos — ⏳ RF-33 verificado no Supabase local com rede interrompida e isolamento; pasta dos pedidos persistidos acessível no e2e de rascunho; falta validação na nuvem
- [x] M2.19 Criar a máquina de estados do pedido — evidência: transições, papéis, propriedade, aceite/sinal/contrato e revisão de entrega testados em 2026-10-11

### Pasta do processo

- [x] M2.20 Criar a pasta do processo com abas e visualizador de PDF — evidência: seis abas compartilhadas cliente/painel, quatro pastas e PDF sob demanda; 5 e2e específicos aprovados em 375/1440 px (um ensaio único omitido no celular), cliente B/admin/anônimo recebem 404, calc autorizado; HEAD/Range/206/416, senha/cancelamento e axe aprovados; docs/evidencias/pasta-processo (2026-10-11, banco local)
- [ ] M2.21 Criar a linha do tempo automática — ⏳ filtro, paginação, notas e helper transacional verificados localmente; quatro e2e em 375/1440 px e seis testes específicos de RLS. Rascunho/upload/mensagem/decisão/concordância/entrega já usam o helper; proposta/aceite/pagamento dependem dos respectivos casos de uso. Evidência: migrations 0016–0018, docs/evidencias/linha-do-tempo/README.md, docs/evidencias/decisoes/README.md e docs/evidencias/entrega/README.md
- [ ] M2.22 Criar as mensagens entre cliente e André — ⏳ conversa/anexos/retry/paginação verificados localmente em 375/1440 px, com seis e2e e nove testes de RLS específicos; avisos new_message enfileirados; despacho depende de M2.28/29. Evidência: migrations 0013–0015 e docs/evidencias/mensagens/README.md
- [x] M2.23 Criar o registro de decisões técnicas com exportação em PDF — evidência: quatro e2e em 375/1440 px e seis testes específicos de RLS; premissa, concordância do cliente, replay/concorrência, privacidade e PDFs de uma/seis páginas conferidos; migrations locais 0018–0019 e docs/evidencias/decisoes/README.md (2026-10-11). CRC/dados reais seguem como insumo de publicação
- [x] M2.24 Criar o índice de páginas do processo — evidência: quatro e2e em 375/1440 px, seis RLS específicos e quatro unitários; CRUD, revisão concorrente, reenvio após remover arquivo e paginação de 61 referências com empates verificados; migrations locais 0020–0022 e docs/evidencias/indice/README.md (2026-10-11)

### Fila, prazos e entrega

- [x] M2.25 Criar a fila do André ordenada pelo prazo interno — evidência: quatro e2e em 375/1440 px e quatro unitários; 116 pedidos com datas empatadas/ausentes, filtro antes do limite e pagamentos parciais/confirmados verificados; migration local 0023, docs/evidencias/fila/README.md (2026-10-11)
- [x] M2.26 Criar a entrega com checklist de pré-juntada — evidência: quatro e2e em 375/1440 px, seis RLS específicos e três unitários; snapshots imutáveis, replay/concorrência, confirmação humana e aviso enfileirado verificados. Migrations locais 0024–0026, docs/evidencias/entrega/README.md (2026-10-11); despacho real depende de M2.28
- [x] M2.26a Paginar entregas confirmadas no resumo do processo — evidência: dois e2e em 375/1440 px; cliente/painel recuperaram 61 registros com empates e microssegundos, cursor inválido/retorno ao início/axe/largura verificados. docs/evidencias/entrega/README.md (2026-10-11)
- [ ] M2.27 Liberar o download das entregas com URL assinada e auditoria — ⏳ bloqueio/políticas/saldo/estorno/isolamento e download auditado de 120 s verificados localmente junto com M2.26; faltam configuração aprovada de D6 e instruções de pagamento. Evidência: docs/evidencias/entrega/README.md

### Notificações

- [ ] M2.28 Configurar os e-mails transacionais e o SMTP do login com o Resend — RF-70
- [ ] M2.29 Enviar alertas ao André por WhatsApp — D7
- [ ] M2.30 Agendar os lembretes de prazo — RF-53
- [ ] M2.31 Criar as preferências de notificação do André — RF-71

### Painel do André

- [ ] M2.32 Criar a página inicial do painel — RF-80
- [ ] M2.33 Criar as configurações do painel — ⏳ telas/RPCs locais, dados profissionais/Pix/condições/horários/limites e histórico de preços verificados; 24 RLS e 44 e2e aprovados; falta tabela real validada pelo André e ligação aos snapshots da proposta (M2.12)

### Qualidade e publicação

- [ ] M2.34 Testar o fluxo completo de ponta a ponta no Playwright
- [ ] M2.35 Fazer a revisão de segurança antes da publicação
- [ ] M2.36 Ensaiar com o André um processo antigo autorizado — responsável: André com o agente
- [ ] M2.37 Publicar o MVP no domínio definido — D3; aprovação do Fábio antes de divulgar

### 🔒 GATE M2 (aprovação do Fábio e do André)

- [ ] Um cliente de teste completa o fluxo inteiro no celular e no computador
- [ ] O André recebe os alertas por WhatsApp e e-mail com o pedido e a data de entrega
- [ ] O orçamento sai na hora, discriminado, com CRC e PDF
- [ ] Nenhum documento é acessível por outro cliente (teste de acesso negado registrado)
- [ ] O André aprova textos, preços, termos e política

## M3 — Validação comercial

Prazo sugerido: 2026-11-17 (a confirmar com o André)

### Planejamento do marco

- [ ] M3.00 Detalhar as tarefas do M3 na especificação e pedir aprovação do Fábio — mesmo formato do M1 e do M2; incluir o que o ensaio e os primeiros pedidos ensinaram

### Pagamento automático

- [ ] M3.01 Integrar o Asaas em sandbox — cliente, cobrança do sinal e do saldo, link de Pix, boleto e cartão, webhook idempotente (RF-31)
- [ ] M3.02 Criar o botão do André para ligar ou desligar o pagamento automático — RF-31
- [ ] M3.03 Ativar o Asaas em produção — conta conforme D9; aprovação do Fábio

### Proposta, contrato e garantia

- [ ] M3.04 Gerar o contrato em PDF no aceite — RF-30
- [ ] M3.05 Publicar e aplicar a política de garantia e reembolso do sinal — RF-36 e D5
- [ ] M3.06 Criar o pedido de revisão dentro da garantia — RF-63
- [ ] M3.07 Permitir ajuste manual do orçamento com motivo — RF-26

### Assinatura e entrega

- [ ] M3.08 Validar automaticamente a assinatura ICP-Brasil do parecer — RF-62 e D6
- [ ] M3.09 Cobrar o saldo na entrega conforme a regra de liberação — RF-35 e D6

### Recorrência no mesmo processo

- [ ] M3.10 Criar a nova versão do PDF quando o processo volta, com as páginas já lidas marcadas — RF-46
- [ ] M3.11 Criar o pedido de atualização sobre o .PJC guardado — reaproveita checklist, índice e decisões
- [ ] M3.12 Criar a confirmação de acordo do cliente nas decisões técnicas — RF-47

### Aquisição e medição

- [ ] M3.13 Instalar o GA4 com banner de consentimento e o Search Console — RF-04; o André quer ver a origem por estado e cidade
- [ ] M3.14 Criar o simulador público de orçamento sem cadastro — RF-03
- [ ] M3.15 Mostrar os indicadores no painel do André — RF-83
- [ ] M3.16 Criar a avaliação depois da entrega e o convite para avaliar no Google — RF-64
- [ ] M3.17 Pré-preencher dados do processo pelo número via DataJud — tribunal, vara, classe e movimentos

### LGPD e confiança

- [ ] M3.18 Criar o contrato de operador de dados e aplicar a política de retenção por job — D8
- [ ] M3.19 Ativar MFA para o André e a administração
- [ ] M3.20 Mostrar ao André o registro de acessos a arquivos — RN-11
- [ ] M3.21 Ativar WhatsApp oficial para clientes com consentimento — RF-72 e D7
- [ ] M3.22 Copiar os arquivos do Storage para fora do Supabase e testar uma restauração — o backup diário do Supabase cobre o banco; conferir se cobre os arquivos

### Pesquisa de mercado

- [ ] M3.23 Entrevistar de 10 a 15 advogados de SP e MG sobre dores, prazos e preço — responsável: André e Fábio; o agente prepara o roteiro e consolida as respostas
- [ ] M3.24 Fazer cliente oculto em três concorrentes — responsável: Fábio; Office Perícia, MH Cálculos e Lagares; registrar preço, prazo e experiência

### Passagem para o cliente

- [ ] M3.25 Escrever o manual do dono — onde está cada conta, quanto custa por mês, como trocar senha e 2FA, quem chamar em caso de problema
- [ ] M3.26 Entregar ao André a conta-mãe e os acessos de produção — senha e 2FA; o André confirma que é dono no Supabase, na Vercel, no Resend e no domínio; aprovação do Fábio
- [ ] M3.27 Trocar as chaves de produção depois da passagem — rotação em cada serviço e atualização das variáveis da Vercel
- [ ] M3.28 Definir o destino do repositório — transferir para uma conta ou organização do cliente, ou manter na Harmony para manutenção (D15)

### 🔒 GATE M3 (aprovação do Fábio e do André)

- [ ] Sinal confirmado automaticamente pelo webhook do Asaas em produção
- [ ] Primeiros pedidos reais pagos e entregues no prazo
- [ ] Indicadores de conversão disponíveis no painel
- [ ] Decisão registrada sobre seguir para a fase operacional com IA

## M4 — Operacional 1: leitura do processo com IA

Prazo sugerido: a definir depois do GATE M3

### Planejamento do marco

- [ ] M4.00 Detalhar as tarefas do M4 na especificação e pedir aprovação do Fábio — carregar antes a skill claude-api; incluir a decisão sobre a execução dos jobs longos

### Acervo e gabarito

- [ ] M4.01 Reunir de 20 a 30 casos antigos do André com processo, cálculo final e parecer — responsável: André; autorização dos clientes ou anonimização
- [ ] M4.02 Montar o gabarito de cada caso com índice de páginas e parâmetros corretos — feito com o André; base da medição de acurácia
- [ ] M4.03 Fechar a política de dados da IA — confirmar a retenção na Anthropic, pedir retenção zero, atualizar a política de privacidade sobre transferência internacional

### Ingestão e triagem

- [ ] M4.04 Escolher e montar a execução de jobs longos para processar PDFs fora da requisição — opções: Vercel Workflow ou Queues, Supabase Edge Functions ou worker dedicado na conta do cliente; decisão registrada; reprocessamento seguro
- [ ] M4.05 Separar páginas, extrair texto e detectar páginas escaneadas — RF-91; pdfjs-dist
- [ ] M4.06 Detectar páginas duplicadas e repetidas — RF-92; hash de texto e hash perceptual
- [ ] M4.07 Classificar as páginas e propor o índice de páginas para o André confirmar — RF-93; triagem local antes de qualquer chamada à IA

### Extração de parâmetros

- [ ] M4.08 Extrair parâmetros da sentença e do acórdão com página e trecho por campo — RF-94; `claude-opus-5-5` com saídas estruturadas
- [ ] M4.09 Criar a tela de validação campo a campo que grava a decisão técnica — RF-94 e RF-44
- [ ] M4.10 Criar o teto de custo por processo e por mês com registro de uso

### Qualidade da IA

- [ ] M4.11 Medir a acurácia por campo no acervo e mostrar no painel de qualidade — RF-95; meta por campo combinada com o André

### 🔒 GATE M4 (aprovação do Fábio e do André)

- [ ] O índice de páginas proposto atinge a meta de acerto combinada no acervo
- [ ] Cada parâmetro extraído mostra a página e o trecho de origem
- [ ] O custo por processo foi medido e está dentro do teto
- [ ] O André aprova o uso em pedidos reais

## M5 — Operacional 2: cartões de ponto, regras e parecer

Prazo sugerido: a definir depois do GATE M4

### Planejamento do marco

- [ ] M5.00 Detalhar as tarefas do M5 na especificação e pedir aprovação do Fábio — incluir o layout de importação do PJe-Calc confirmado

### Cartões de ponto

- [ ] M5.01 Confirmar o layout de importação de cartão de ponto na versão vigente do PJe-Calc — manual oficial e teste com o André
- [ ] M5.02 Ler cartões de ponto, inclusive manuscritos, para tabela com confiança por célula — RF-96
- [ ] M5.03 Validar os horários com regras e criar a tela de conferência com as células duvidosas destacadas — RF-96
- [ ] M5.04 Exportar o CSV de importação do PJe-Calc e testar a importação com o André — RF-96

### Regras de juros e correção

- [ ] M5.05 Catalogar com o André as modulações de juros e correção que ele usa, com a fonte legal — ele citou mais de oito
- [ ] M5.06 Criar o motor de regras determinístico e versionado com testes — RF-97; ADC 58 e 59, Lei 14.905/2024 e modulações do André
- [ ] M5.07 Sugerir a modulação pela IA a partir do texto da decisão, com escolha do André — RF-97

### Parecer

- [ ] M5.08 Definir com o André o modelo de parecer enxuto — seções fixas
- [ ] M5.09 Gerar o rascunho do parecer com as decisões e as páginas de origem — RF-98

### Ganho de capacidade

- [ ] M5.10 Medir o tempo por cálculo antes e depois — meta: dobrar a capacidade do André

### 🔒 GATE M5 (aprovação do Fábio e do André)

- [ ] O CSV de cartão de ponto é importado no PJe-Calc sem erro nos casos de teste
- [ ] O motor de regras reproduz os cálculos do acervo dentro da tolerância combinada
- [ ] O tempo médio por cálculo caiu de forma medida

## M6 — Mercado

Prazo sugerido: a planejar

### Planejamento do marco

- [ ] M6.00 Detalhar as tarefas do M6 na especificação e pedir aprovação do Fábio

### Canais

- [ ] M6.01 Propor convênio à CAADF e às Caixas de Assistência de SP e MG — modelo do desconto da Jusfy; aprovação do Fábio e do André antes de qualquer contato
- [ ] M6.02 Preparar palestra técnica para ESA ou comissão da OAB — Lei 14.905, ADC 58 e PJe-Calc; publicidade técnica conforme o CFC

### Produto

- [ ] M6.03 Incluir as áreas cível e previdenciária no checklist
- [ ] M6.04 Criar contas de escritório com vários usuários — RF-13
- [ ] M6.05 Estudar a abertura para outros calculistas
- [ ] M6.06 Investigar a geração direta do arquivo .PJC — RF-99

## Especificação das tarefas

<!-- hub: ignorar -->

**Como ler cada especificação:**
- "Fazer" lista os passos na ordem.
- "Pronto quando" é o critério de aceite; a evidência vai no item da tarefa.

**Valem para todas as tarefas:**
- **Código:**
  - fica em `app/`;
  - identificadores de código, tabelas e colunas em inglês;
  - textos de tela em português.
- **Segredos:** comandos que precisam deles rodam por `scripts/com-segredos.sh` (depois de M1.22).
- **Next.js 16:** ler antes as regras do Hub em `../Sistema de Gestão da Harmony Digital/app/AGENTS.md`. Exemplo: o `middleware.ts` virou `proxy.ts`.
- **Skills:**
  - `vercel:nextjs` para dúvidas de Next.js;
  - `frontend-design` para telas;
  - `claude-api` para qualquer código que chame o Claude.
- **Testes de tela:** em 375 px e 1440 px, com axe sem violações.
- **Ferramentas de linha de comando deste Mac que estão em outras contas:** a CLI da Vercel está logada em `agencialivestyle-3174` e a CLI do Supabase em outra conta (o projeto do cliente não aparece nela). Não usar `vercel` sem `--token` do cliente, nem `supabase link`, `db push` ou outro comando de nuvem. `supabase start` é local e pode ser usado.

### M1 — Fundação técnica

#### M1.03 Aprovar os MCPs e fazer o login (Fábio)

- **Fazer:**
  1. Abrir uma sessão nova do Claude Code nesta pasta.
  2. Aprovar `andre-calculos-supabase` e `andre-calculos-vercel` quando aparecer o aviso.
  3. No `/mcp`, autenticar os dois. Se o `/mcp` não aparecer na extensão do VS Code, rodar `claude` no terminal integrado.
  4. No navegador, entrar com a conta nova do cliente, usando uma janela anônima ou um perfil separado.
- **Pronto quando:** os dois aparecem como conectados no `/mcp`.

#### M1.04 Conferir os dois MCPs e registrar os identificadores

- **Fazer:**
  1. No `andre-calculos-supabase`, chamar `get_project_url`. Precisa responder `https://qtofwbxujshroaafxowr.supabase.co`.
  2. No `andre-calculos-vercel`, chamar `list_teams`. Precisa listar só o time do cliente; anotar o slug e o id.
  3. Gravar `VERCEL_TEAM` (e `SUPABASE_ORG`, se aparecer) em `scripts/contas-esperadas.env` e na tabela do `AGENTS.md` §7.
  4. Rodar `bash scripts/preflight.sh`.
- **Pronto quando:** os dois MCPs respondem com as contas do cliente e o preflight mostra os valores registrados.
- **Se der errado:** se aparecer projeto ou time de outro cliente, parar e pedir ao Fábio para refazer o login (M1.03).

#### M1.05 Confirmar região e plano (Fábio confirma, agente registra)

- **Fazer:**
  1. O Fábio confere no painel do Supabase a região (esperada: South America, São Paulo) e o plano (esperado: Pro). Na Vercel, confere o plano (esperado: Pro).
  2. Se o projeto do Supabase estiver fora de São Paulo, decidir antes de criar tabelas: recriar o projeto (está vazio) ou seguir assim.
  3. O agente registra região e plano no Registro de Execução e no `PRD.md` §11.2.
- **Pronto quando:** região e planos estão registrados.

#### M1.06 Confirmar a conta-mãe (Fábio)

- **Fazer:**
  1. Confirmar que Supabase e Vercel foram criados com o Gmail novo do cliente.
  2. Ativar 2FA por app autenticador e pôr o celular e o e-mail do André como recuperação.
  3. Guardar o login no cofre só de pessoas (D14).
- **Pronto quando:** o Fábio confirma.

#### M1.07 Conta no Resend (Fábio)

- **Fazer:**
  1. Criar a conta com a conta-mãe.
  2. Gerar uma chave de API de envio para desenvolvimento e guardar no cofre `proj-andre-calculos`: item "Resend", campo `RESEND_API_KEY`.
- **Pronto quando:** o item existe no cofre.

#### M1.08 Instalar OrbStack ou Docker Desktop (Fábio)

- **Fazer:**
  1. Instalar o OrbStack (recomendado no Mac por ser leve: `brew install --cask orbstack`) ou o Docker Desktop.
  2. Abrir o app uma vez.
- **Pronto quando:** `docker info` responde no terminal.

#### M1.10 Tirar o áudio do primeiro commit (Fábio decide, agente executa)

- **Fazer** (só com o ok do Fábio):
  1. `git rm --cached "PROJETO DO ANDRE THE ONE.m4a"`.
  2. `git add .gitignore`.
  3. `git commit --amend --no-edit`.
- **Observação:** o arquivo continua na pasta e o `.gitignore` já ignora `*.m4a`.
- **Pronto quando:** `git show --stat HEAD` não lista o `.m4a`.

#### M1.11 Organizar a pasta do projeto

- **Fazer:**
  1. Organizar a transcrição em `docs/transcricao-reuniao-2026-10-10.md`, preservando o conteúdo original.
  2. Organizar o relatório em `docs/pesquisa/reports/` e as notas em `docs/pesquisa/research_notes/`; preservar os arquivos e incluir caminhos explícitos no commit.
  3. Criar um `README.md` curto: o que é o projeto, como rodar (apontar para o `AGENTS.md`) e a estrutura de pastas.
  4. Atualizar os caminhos citados em `AGENTS.md` (§2 e §11), `PRD.md` (cabeçalho) e neste plano.
  5. Commit.
- **Pronto quando:** nenhum link local quebrado; conferir os destinos relativos em `AGENTS.md`, `PRD.md`, `plan.md`, `README.md` e `docs/`.

#### M1.12 Primeiro push

- **Fazer:**
  1. Rodar o preflight.
  2. `export GH_TOKEN="$(gh auth token --user fabioalmeidadigital)"`.
  3. `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin main`.
- **Observação:** o primeiro push vai direto para a `main`. Depois, só por PR.
- **Pronto quando:** `gh repo view Harmony-Digital/andre-calculos` mostra o SHA do último commit.

#### M1.13 CI de qualidade e proteção da main

- **Fazer:**
  1. Criar `.github/workflows/qualidade.yml`:
     - roda em `pull_request` e em `push` para a `main`;
     - Node 22, `working-directory: app`;
     - `npm ci` e `npm run check`.
  2. Tentar proteger a `main`, exigindo PR e o CI verde, com `gh api` (rulesets).
  3. Se o plano da organização não permitir isso em repositório privado, registrar no Registro de Execução e manter a regra de processo do `AGENTS.md` §4.
- **Pronto quando:** um PR de teste mostra o job "Qualidade" verde.

#### M1.21 Itens do cofre (Fábio)

- **Fazer:** a cada serviço configurado, criar um item no cofre certo (D14), com os campos no nome da variável (`PRD.md` §11.7).
- **Pronto quando:** essa tarefa fica aberta até o M2. Marcar quando todos os serviços do M2 estiverem no cofre.

#### M1.22 app/.env.tpl e scripts/com-segredos.sh

- **Fazer:**
  1. Criar `app/.env.tpl` com as variáveis do `PRD.md` §11.7 que já existem:
     - segredos como referência `op://proj-andre-calculos/<Item>/<CAMPO>`;
     - valores públicos e locais (como a URL do Supabase local) escritos direto.
  2. Criar `scripts/com-segredos.sh`:
     - lê o token com `security find-generic-password -a "$USER" -s op-sa-andre-calculos-agente -w`, só dentro do script;
     - exporta `OP_SERVICE_ACCOUNT_TOKEN`;
     - entra em `app/` e roda `exec op run --env-file=.env.tpl -- "$@"`.
  3. Criar `scripts/dev-env.sh`, que captura internamente `supabase status -o json`, confirma a URL local exata e injeta as chaves apenas no ambiente do processo. Não grava `.env.local` nem imprime valores (AGENTS §7.1).
  4. Documentar o uso no README: `scripts/com-segredos.sh npm run dev`.
- **Pronto quando:** `scripts/com-segredos.sh npm run dev` sobe o app, e nenhum valor de segredo aparece no repositório nem na saída.

#### M1.23 Variáveis de produção na Vercel (Fábio; agente prepara)

- **Fazer:**
  1. O agente cria `docs/variaveis-producao.md` com a lista de nomes, o item no cofre e o ambiente (production ou preview) de cada variável.
  2. O agente cria `scripts/sincronizar-vercel.sh`, que o Fábio roda com a conta dele no 1Password e o token da Vercel do cliente, usando `vercel env add`.
  3. O Fábio roda o script.
- **Pronto quando:** `/api/health` em produção responde e as funções que dependem das variáveis funcionam.

#### M1.24 Segredos no CI

- **Fazer:** só se algum job precisar de segredo. Usar `1password/load-secrets-action` com uma conta de serviço própria do CI (o Fábio cria). Se nenhum job precisar, marcar como "não necessário" com a data.
- **Pronto quando:** o job roda sem segredo exposto, ou a tarefa está registrada como não necessária.

#### M1.30 Criar o app Next.js 16.4

- **Fazer:**
  1. Na raiz: `npx create-next-app@16.4.0 app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`.
  2. Dentro de `app/`: `npx shadcn@latest init`, com cor base neutra.
  3. Instalar como desenvolvimento: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `prettier`, `@playwright/test`, `@axe-core/playwright`. Depois, `npx playwright install chromium`.
  4. Instalar `server-only`, `zod` e `pino`.
  5. Criar no `package.json` os scripts do Hub: `dev`, `build`, `start`, `lint`, `typecheck` (`next typegen && tsc --noEmit`), `test` (`vitest run`), `e2e` (`playwright test`), `format`, `format:check` e `check` (format:check, lint, typecheck, test e build). Adicionar `"engines": {"node": ">=22"}`.
  6. Criar a estrutura `src/app`, `src/modules`, `src/lib` e `tests/e2e`.
  7. Escrever um teste unitário de exemplo.
- **Pronto quando:** `npm run check` passa verde e `npm run dev` abre a página.

#### M1.31 Base visual provisória

- **Fazer:**
  1. Carregar a skill `frontend-design`.
  2. Criar os grupos de rotas:
     - `(site)`: público, com cabeçalho e rodapé (rodapé com o espaço para nome e CRC);
     - `(cliente)`: área do advogado, com menu Processos, Novo pedido e Conta;
     - `(painel)`: área do André, com menu Fila, Pedidos, Clientes e Configurações.
  3. Criar os tokens em `globals.css` (variáveis do shadcn):
     - paleta sóbria, neutra, com uma cor de destaque;
     - par tipográfico profissional pelo `next/font` (sugestão: Source Sans 3 e Source Serif 4);
     - sem emojis e sem gradientes chamativos.
  4. Criar páginas provisórias: `/`, `/entrar`, `/cadastro`, `/app` e `/painel`.
  5. Escrever um teste no Playwright que abre cada página em 375 e 1440 px e roda o axe.
- **Pronto quando:** o teste passa, e o visual está registrado em capturas no PR.

#### M1.32 Rota de saúde

- **Fazer:**
  1. Criar `src/app/api/health/route.ts`. Ele responde `{status: "ok", version, sha, region}`:
     - `version` vem do `package.json`;
     - `sha` vem de `process.env.VERCEL_GIT_COMMIT_SHA ?? "local"`;
     - `region` vem de `process.env.VERCEL_REGION`.
  2. Escrever um teste.
- **Pronto quando:** o teste passa e `curl localhost:3000/api/health` responde.

#### M1.40 Supabase local

- **Fazer:**
  1. Na raiz: `supabase init`. Em `supabase/config.toml`, definir `project_id = "andre-calculos"` e `[storage] file_size_limit = "500MB"`, alinhado ao limite de 500 MB do bucket.
  2. `supabase start`.
  3. Criar `scripts/seed-dev.ts`, que roda com `npx tsx` e usa a API admin local para criar usuários de teste com os e-mails `@exemplo.com`:
     - cliente A;
     - cliente B;
     - André de teste (calculista);
     - admin de teste.
  4. Criar `supabase/seed.sql` com um processo inventado. Nenhum dado real.
  5. Documentar no README como subir: `supabase start`, `scripts/dev-env.sh`, seed.
- **Observação:** `supabase start` é local e não usa login. Não rodar `supabase link`, `db push` nem comandos de nuvem: a CLI está logada em outra conta.
- **Pronto quando:** `supabase status` mostra tudo rodando e os quatro usuários existem.

#### M1.41 Ligar o app ao Supabase com @supabase/ssr

- **Fazer:**
  1. Instalar `@supabase/supabase-js` e `@supabase/ssr`.
  2. Criar os clientes:
     - `src/lib/supabase/server.ts`: `createServerClient` com cookies, sessão do usuário, RLS aplicada;
     - `src/lib/supabase/admin.ts`: `import 'server-only'`, chave secreta, só para cron, webhooks e operações de sistema, sempre com verificação explícita de permissão;
     - `src/lib/supabase/browser.ts`: cliente público disponível apenas para Auth/Storage; login realizado por Server Action e cookies HttpOnly, upload por assinatura restrita ao caminho, sem expor JWT da sessão.
  3. Criar `src/proxy.ts` (Next 16), que renova a sessão.
  4. Criar uma função `getSessionProfile()` que devolve o usuário e o papel.
- **Pronto quando:** um teste mostra uma página server lendo o usuário logado, e nenhum componente cliente faz consulta de dados ao banco.

#### M1.42 Migrations iniciais com RLS

- **Fazer:**
  1. Criar com `supabase migration new init` o arquivo `supabase/migrations/<timestamp>_init.sql`, com as tabelas abaixo. Regras gerais:
     - dinheiro em `bigint` com sufixo `_cents`; datas em `date`; momentos em `timestamptz`;
     - `id uuid default gen_random_uuid()`;
     - `created_at` e `updated_at` em todas.

     As tabelas:
     - `profiles`: `id` = `auth.users.id`, `role` (`client`, `calculator`, `admin`), `full_name`, `phone`, `oab_number`, `oab_state`;
     - `clients`: `owner_id`, `kind` (`person`, `company`), `document`, `legal_name`, `has_contract`;
     - `processes`: `client_id`, `cnj_number`, `court`, `chamber`, `side` (`claimant`, `defendant`), `claimants_count`;
     - `orders`: `process_id`, `client_id`, `calc_type`, `area`, `status`, `urgent`, `complexity`, `total_cents`, `deposit_cents`, `delivery_date`, `internal_due_date`, `price_table_id`, `code` (`P-0001`);
     - `checklists`: `order_id`, `schema_version`, `answers` em jsonb;
     - `price_tables`: `version`, `active`, `is_example`;
     - `price_items`: `price_table_id`, `code`, `label`, `kind` (`base`, `addon`, `percent`), `amount_cents`, `percent_bp`, `rule` em jsonb;
     - `quotes`: `order_id`, `number`, `items` em jsonb, `total_cents`, `valid_until`, `accepted_at`, `accepted_ip`, `accepted_user_agent`, `accepted_by`;
     - `payments`: `order_id`, `kind` (`deposit`, `balance`, `triage`), `method` (`pix_manual`, `asaas`), `amount_cents`, `status` (`pending`, `confirmed`, `refunded`), `confirmed_by`, `confirmed_at`, `provider_ref`;
     - `files`: `process_id`, `order_id`, `folder` (`case`, `client`, `deliverables`, `triage`), `bucket`, `path`, `name`, `mime`, `size_bytes`, `sha256`, `version`, `pages`, `uploaded_by`;
     - `page_index`: `process_id`, `file_id`, `piece`, `pages` em texto, `note`;
     - `decisions`: `process_id`, `order_id`, `parameter`, `value`, `source` (`judgment`, `appeal`, `decision`, `lawyer`, `calculator`), `page`, `rationale`, `recorded_by`, `client_confirmed_at`;
     - `messages`: `process_id`, `author_id`, `body`, `attachment_ids` em `uuid[]`;
     - `timeline_events`: `process_id`, `order_id`, `kind`, `data` em jsonb, `actor_id`;
     - `deadlines`: `order_id`, `notice_date`, `act_type`, `days`, `due_date`, `slack_days`, `internal_due_date`, `adjustments` em jsonb;
     - `notifications` (fila de envios): `channel` (`email`, `whatsapp`), `recipient`, `template`, `data` em jsonb, `status` (`pending`, `sent`, `failed`), `attempts`, `last_error`, `send_after`, `sent_at`, `dedup_key` único;
     - `notification_preferences`: `profile_id`, `event`, `channel`, `enabled`;
     - `settings`: uma linha, com dados do responsável técnico, chave Pix, contatos do André, folga, urgência, validade da proposta e textos padrão;
     - `reviews`;
     - `audit_log`: `actor_id`, `action`, `target_type`, `target_id`, `ip`;
     - `consents`: `profile_id`, `document` (`terms`, `privacy`), `version`, `accepted_at`, `ip`.
  2. Criar as funções `is_calculator()` e `is_admin()` (`security definer`, leem `profiles.role`).
  3. Criar a RLS em todas as tabelas:
     - o cliente vê só o que pertence aos clientes dele;
     - o calculista vê tudo;
     - o admin vê configurações, mas não arquivos nem mensagens (D13).
  4. Criar a trigger `handle_new_user`: cria o `profile` (papel `client`), o `client` e os `consents` a partir do `raw_user_meta_data`.
  5. Aplicar localmente: `supabase db reset`.
  6. Escrever testes de RLS (Vitest contra o Supabase local) com os usuários A e B.
  7. Aplicar na nuvem pelo MCP `andre-calculos-supabase`, com `apply_migration` e o mesmo SQL. Depois, `get_advisors` de segurança e de desempenho.
- **Pronto quando:** os testes de RLS passam (o cliente B não lê nada do A), e os advisors não têm achado crítico.

#### M1.43 Login e papéis

- **Fazer:**
  1. Criar as páginas:
     - `/entrar`: e-mail e senha, e link de acesso;
     - `/recuperar-senha`;
     - o callback de confirmação.
  2. Criar a função `requireRole()` nos layouts de `(cliente)` e `(painel)`:
     - o cliente não entra no painel;
     - o calculista e o admin entram no painel.
  3. Em desenvolvimento, os e-mails do login caem no Mailpit local (porta 54324).
  4. O papel de calculista e de admin é dado por SQL pelo Fábio (o seed local já cria).
  5. Escrever um teste e2e: o cliente tenta abrir `/painel` e recebe acesso negado.
- **Pronto quando:** os testes de login, logout e acesso negado passam.

#### M1.44 Buckets privados e upload retomável

- **Fazer:**
  1. Por migration, criar o bucket `processos`:
     - privado;
     - limite de 500 MB por arquivo;
     - tipos permitidos: PDF, imagens, XLSX, CSV, DOCX e `application/octet-stream` para o .pjc.
  2. Usar o caminho `{client_id}/{process_id}/{folder}/{uuid}-{nome}`.
  3. Criar as políticas em `storage.objects`:
     - cliente/calculista só inserem em caminhos de uploads pendentes autorizados;
     - leitura passa pelo servidor, com RLS e auditoria antes da URL assinada; não conceder SELECT direto em Storage para permitir bypass da auditoria.
  4. Fazer o upload pelo navegador com Uppy e `@uppy/tus`:
     - endpoint `https://qtofwbxujshroaafxowr.storage.supabase.co/storage/v1/upload/resumable/sign` (local: `http://127.0.0.1:54321/storage/v1/upload/resumable/sign`), conforme exemplo oficial de upload assinado do Supabase;
     - cabeçalhos `x-signature` (autorização de um caminho por 2 h) e `apikey` pública; JWT de sessão permanece no servidor;
     - pedaços de 6 MiB e uploadDataDuringCreation; conferir tamanho e SHA-256 no servidor antes de liberar o arquivo.
  5. No servidor, gerar o download como URL assinada de 120 s e registrar no `audit_log`.
  6. No painel do Supabase (plano Pro), ajustar o limite global de arquivo.
- **Pronto quando:** um arquivo fictício de 300 MB sobe localmente, o upload retoma depois de cortar a rede, e o cliente B não consegue baixar arquivo do A.

#### M1.50 Projeto na Vercel e produção

- **Fazer:**
  1. **O Fábio** instala o app da Vercel (conta do cliente) na organização Harmony-Digital do GitHub, com acesso só a `andre-calculos`.

     Se preferir não instalar, a alternativa é publicar pelo GitHub Actions com um `VERCEL_TOKEN` do cofre de produção.
  2. **O agente**, pelo MCP `andre-calculos-vercel` ou pelo painel com o Fábio:
     - cria o projeto ligado ao repositório, com Root Directory `app`, framework Next.js e Node 22;
     - cria o `app/vercel.json` com `"regions": ["gru1"]`;
     - define a branch de produção `main`;
     - liga o preview a cada PR.
  3. Publicar.
  4. Depois, registrar `VERCEL_PROJETO` em `scripts/contas-esperadas.env` e, se quiser, restringir o MCP ao projeto pela URL `https://mcp.vercel.com/<time>/<projeto>`.
- **Pronto quando:** a URL `.vercel.app` responde `/api/health` com o SHA, na região `gru1`.

#### M1.51 Fila de envios e Vercel Cron

- **Fazer:**
  1. Criar `src/modules/notifications` com:
     - `enqueue({channel, recipient, template, data, dedupKey})`;
     - `processPending()`: tenta até 5 vezes, com espera crescente.
  2. Criar os adaptadores:
     - `console` (desenvolvimento);
     - `email` e `whatsapp`, ainda vazios, que serão preenchidos em M2.28 e M2.29.
  3. Criar a rota `src/app/api/cron/notifications/route.ts`, que exige `Authorization: Bearer ${CRON_SECRET}`. A Vercel envia esse cabeçalho sozinha quando a variável existe.
  4. No `vercel.json`, criar o cron `{"path": "/api/cron/notifications", "schedule": "*/5 * * * *"}`.
  5. Escrever testes de fila, dedup e nova tentativa.
- **Pronto quando:** os testes passam e o cron aparece no painel da Vercel.

#### M1.52 Backup do banco

- **Fazer:**
  1. Confirmar no painel do Supabase (plano Pro) que o backup diário está ativo.
  2. Escrever `docs/operacao.md`: onde ver os backups, como restaurar (restaurar para um projeto novo e conferir), quem pode fazer.
  3. Registrar que os arquivos do Storage terão cópia própria no M3 (M3.22).
- **Pronto quando:** o documento existe e o backup aparece no painel.

#### M1.60 Cadastro no Hub (Fábio)

- **Fazer:**
  1. No Hub, criar o projeto.
  2. Em Editar projeto, Importar o plan.md: colar este arquivo, ver a prévia e importar.
  3. Devolver ao repositório o arquivo com os códigos HUB.
  4. Criar a chave do agente e guardar no cofre: item "Hub", campo `HUB_API_KEY`.
- **Pronto quando:** o plano existe no Hub e o arquivo com os códigos está no repositório.

#### M1.61 MCP do Hub

- **Fazer:**
  1. Seguir `docs/agentes-conexao.md` do repositório do Hub.
  2. Adicionar o servidor `hub` ao `.mcp.json`, sem segredo, com a chave vinda de `HUB_API_KEY`.
  3. Fazer a primeira chamada: `hub_whoami`.
- **Pronto quando:** `hub_whoami` mostra o projeto deste cliente.

### M2 — Portal comercial no ar

#### M2.01 Formulário de marca

- **Fazer:**
  1. O agente escreve `docs/marca/formulario.md`, com 10 a 15 perguntas: público, valores, tom, nomes de que gosta e de que não gosta, cores, concorrentes e as restrições do CFC à publicidade.
  2. O Fábio envia ao André.
  3. Com as respostas, o agente propõe 10 nomes, confere o domínio `.com.br` no Registro.br e recomenda uma busca no INPI.
  4. O Fábio e o André decidem (D3).
- **Pronto quando:** D3 está marcada com nome e domínio.

#### M2.02 Página inicial

- **Fazer:**
  1. Em `(site)/page.tsx`, criar as seções:
     - proposta de valor;
     - como funciona, em 4 passos;
     - o que está incluído: PDF do cálculo, .PJC, parecer assinado e registro das decisões;
     - prazos e urgência;
     - preço "a partir de", lido da tabela ativa;
     - garantia (texto conforme D5);
     - responsável técnico: nome, CRC e categoria, lidos de `settings`;
     - perguntas frequentes;
     - chamada para o cadastro;
     - rodapé com CRC, termos, privacidade e contato.
  2. Seguir as regras de texto da NBC PG 01: nada de "o mais barato", nada de garantia de êxito, nenhuma comparação com concorrentes, tom técnico.
  3. Criar metadados de SEO e Open Graph.
  4. Enquanto o André não mandar os dados, mostrar marcadores visíveis só fora de produção. Em produção, a seção do responsável técnico não aparece sem os dados reais.
- **Pronto quando:** o teste de tela e o axe passam, e o texto tem o ok do André.

#### M2.03 Termos de uso e política de privacidade v1

- **Fazer:**
  1. Criar `app/content/legal/termos-v1.md` e `privacidade-v1.md`, exibidos em `/termos` e `/privacidade`, com a versão numa constante.
  2. **Termos:** objeto; cadastro; orçamento e proposta; pagamento de 50% e 50%; prazos; responsabilidades do cliente (documentos e informações); garantia; propriedade das entregas; foro.
  3. **Privacidade:**
     - controlador (André ou a empresa dele);
     - fornecedores (Supabase, Vercel, Resend, Meta/WhatsApp e, a partir do M4, Anthropic);
     - bases legais: art. 7º, V e VI; art. 11, II, "d";
     - dados tratados e retenção (D8);
     - direitos do titular e contato do encarregado;
     - transferência internacional.
  4. Marcar o texto como rascunho a ser revisado por advogado.
- **Pronto quando:** as páginas estão no ar, e a versão é gravada no aceite (`consents`).

#### M2.04 Cadastro e login do cliente

- **Fazer:**
  1. Em `/cadastro`, criar o formulário com os campos do RF-10 e a validação:
     - CPF e CNPJ com dígito verificador, em `src/lib/documents.ts`, com testes;
     - OAB: número e UF;
     - celular convertido para o formato E.164.
  2. Chamar o `signUp` do Supabase com `options.data`, contendo os dados e as versões dos termos e da política. A trigger de M1.42 cria `profile`, `client` e `consents`.
  3. Exigir confirmação do e-mail.
  4. Mostrar as mensagens de erro em português, com o nome do campo.
- **Pronto quando:** o e2e faz o cadastro, a confirmação (Mailpit local), o login e chega a `/app`.

#### M2.05 Aviso ao André no cadastro

- **Fazer:**
  1. No caso de uso do cadastro, chamar `enqueue` com o modelo `new_signup` para o André, pelos canais das preferências dele.
  2. O conteúdo é nome, OAB e cidade. Nada de documento.
- **Pronto quando:** o teste mostra a notificação na fila após o cadastro.

#### M2.06 Página da conta

- **Fazer:** em `/conta`:
  1. editar o perfil;
  2. trocar a senha (`updateUser`);
  3. pedir exclusão de conta: registra em `audit_log`, avisa o André e mostra o aviso de que a exclusão respeita a retenção legal.
- **Pronto quando:** existem testes para os três fluxos.

#### M2.07 Tabela de preços (André; agente prepara)

- **Fazer:**
  1. O agente escreve `docs/precos/questionario.md` com o que o André precisa definir:
     - preço base por tipo de cálculo;
     - adicionais: por verba, por período, por cartão de ponto a digitar, por reclamante extra;
     - percentual de urgência;
     - prazo padrão por complexidade;
     - folga;
     - validade da proposta.
  2. O agente cria o seed com os valores de referência do relatório de concorrentes, marcado `is_example = true`: inicial R$ 150, liquidação R$ 250, impugnação R$ 300, atualização R$ 100, cartão de ponto +R$ 70, urgência +30%.
  3. Quando o André responder, carregar os valores pelo painel (M2.33).
- **Pronto quando:** a tabela real do André está ativa.

#### M2.08 Checklist trabalhista em etapas

- **Fazer:**
  1. Criar o schema `checklistLaborV1` (Zod) em `src/modules/checklist/v1.ts`, em 9 etapas:
     1. Processo: número CNJ, TRT, vara, lado e número de reclamantes.
     2. Tipo de cálculo.
     3. Decisões: sentença, acórdão, decisão interlocutória, índice fixado, estratégia do advogado.
     4. Datas.
     5. Verbas.
     6. Jornada: cartões digitais, manuscritos (com estimativa de meses) ou jornada fixada pelo juiz.
     7. Documentos e descontos.
     8. Prazo: data da ciência, tipo de ato, urgência.
     9. Instruções.
  2. Validar o número CNJ com o dígito verificador (módulo 97, Resolução CNJ 65/2008) em `src/lib/cnj.ts`, com testes. Na Justiça do Trabalho, o segmento J é 5.
  3. Fazer a interface com React Hook Form e `zodResolver`, por etapa, e um resumo no fim.
  4. Antes do banco, a interface fica só no estado da tela. Depois de M1.42, o rascunho é salvo em `orders` (`draft`) e `checklists`.
- **Pronto quando:** existem testes do schema e e2e do preenchimento completo, e o André validou os campos.

#### M2.09 Motor de preço

- **Fazer:**
  1. Criar `src/modules/quotes/pricing.ts` com `calculateQuote(answers, priceTable)`. Ele devolve:
     - os itens (código, descrição, valor em centavos);
     - subtotal, urgência e total;
     - sinal (metade do total arredondada para cima em centavos) e saldo;
     - complexidade (de M2.11);
     - prazo em dias úteis.
  2. Usar só inteiros: centavos e pontos-base (1% = 100 pb).
  3. Escrever testes em tabela: cada adicional, urgência, arredondamento e tabela vazia.
- **Pronto quando:** a cobertura do arquivo fica acima de 95%.

#### M2.10 Calculadora de prazo processual

- **Fazer:**
  1. Criar em `src/modules/deadlines/` as funções `isBusinessDay`, `addBusinessDays` e `computeDeadline({noticeDate, actType, days?, suspensions[]})`.
  2. A contagem segue o art. 775 da CLT: exclui o dia do começo, inclui o do vencimento e conta só dias úteis.
  3. Os prazos por tipo de ato: impugnação 8, embargos 5, agravo de petição 8, outro com os dias informados.
  4. O calendário é próprio, com a Páscoa calculada:
     - feriados nacionais: 1/1, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11 e 25/12;
     - feriados da Justiça Federal e do Trabalho (Lei 5.010/1966, art. 62): segunda e terça de Carnaval, quarta a sexta da Semana Santa, 11/8, 1/11 e 8/12;
     - suspensão de prazos de 20/12 a 20/01 (CLT, art. 775-A);
     - feriados locais e portarias do TRT entram em `suspensions`, com motivo.
  5. Calcular o prazo interno: vencimento menos a folga, em dias úteis (D10).
  6. Escrever testes com casos reais: véspera de Carnaval, Semana Santa, 20/11, dezembro e janeiro.
  7. Conferir a lista de feriados com o André antes de publicar.
- **Pronto quando:** os testes passam e o André confere três casos.

#### M2.11 Classificador de complexidade

- **Fazer:** criar `classifyComplexity(answers)`, que devolve `{level, reasons[]}`:
  - **alta:** cartões manuscritos ou em imagem, mais de um reclamante, 6 ou mais verbas, ou processo com mais de 1.000 páginas;
  - **simples:** só verbas rescisórias, sem jornada;
  - **média:** o resto.
- **Pronto quando:** existem testes por regra. Os limites ficam em `settings` para o André ajustar.

#### M2.12 Tela de orçamento e PDF da proposta

- **Fazer:**
  1. Ao fim do checklist, criar a proposta `quotes`, com número sequencial `ORC-AAAA-NNNN` e validade padrão de 7 dias (em `settings`).
  2. Mostrar os itens, o total, o sinal, o saldo, o prazo de entrega, as condições, e os botões Aceitar e Recusar.
  3. Gerar o PDF em `GET /api/quotes/[id]/pdf`, autenticado, com `@react-pdf/renderer`. Ele traz nome, CRC, contato, itens, total, validade, condições e data.
- **Pronto quando:** o e2e gera a proposta e baixa o PDF, e o PDF mostra o CRC.

#### M2.13 Caminho "Só o PDF"

- **Fazer:**
  1. No "Novo pedido", oferecer a escolha "Só o PDF". O cliente envia o PDF (M2.18) e paga a triagem (sinal manual, tipo `triage`).
  2. O pedido passa por `awaiting_triage` e `in_triage`.
  3. O André preenche o checklist e o índice de páginas no painel, e a proposta é gerada.
  4. A taxa é abatida do cálculo se D5 assim definir (configuração em `settings`).
- **Pronto quando:** existe um e2e do caminho inteiro.

#### M2.14 Aviso de orçamento ao André

- **Fazer:** enfileirar `quote_created` para o André a cada proposta.
- **Pronto quando:** um teste confirma.

#### M2.15 Aceite eletrônico

- **Fazer:**
  1. Criar a server action que grava `accepted_at`, o IP (primeiro valor de `x-forwarded-for`), o user agent, o usuário e o número da proposta.
  2. Fazer a transição do pedido: `awaiting_payment`, ou `queued` se o cliente tem contrato.
  3. Registrar na linha do tempo.
  4. Notificar o cliente (instruções de pagamento) e o André.
- **Pronto quando:** existem testes da transição e do registro.

#### M2.16 Pagamento manual do sinal

- **Fazer:**
  1. O cliente vê o valor, a chave Pix (de `settings`) e o código do pedido para pôr na descrição do Pix.
  2. No painel, o botão "Confirmar sinal":
     - marca `payments.confirmed`;
     - move o pedido para `queued` (se houver documentos) ou o mantém aguardando documentos;
     - registra na linha do tempo;
     - envia ao André o alerta "Pedido P-0001, entrega dia DD/MM".
- **Pronto quando:** o e2e cobre a confirmação e o alerta entra na fila.

#### M2.17 Cliente com contrato

- **Fazer:** criar no painel a opção `has_contract` no cliente, com motivo. O efeito segue a RN-04: o pedido entra na fila sem sinal.
- **Pronto quando:** um teste cobre a regra.

#### M2.18 Upload retomável de documentos

- **Fazer:**
  1. Criar o componente `DocumentUpload`, com Uppy Dashboard e Tus (configuração de M1.44).
  2. Calcular o SHA-256 no navegador, em partes, com `hash-wasm`.
  3. Ao terminar, uma server action confere o objeto pelo cliente admin e cria a linha em `files`, mais o evento na linha do tempo.
  4. Mostrar mensagens claras para tipo não permitido e limite de tamanho.
- **Pronto quando:** existe um e2e com arquivo grande fictício e o hash fica gravado.

#### M2.19 Máquina de estados do pedido

- **Fazer:**
  1. Criar `src/modules/orders/state-machine.ts`, com os estados (rótulos em português na tela): `draft`, `awaiting_triage`, `in_triage`, `quoted`, `awaiting_payment`, `queued`, `in_analysis`, `awaiting_client`, `in_calculation`, `in_review`, `delivered`, `completed`, `in_adjustment`, `cancelled`, `refunded`.
  2. Definir os eventos permitidos por papel.
  3. Criar a função `transition(order, event, actor)`, que devolve o novo estado ou um erro em português.
  4. Escrever testes para cada transição válida e para as proibidas mais importantes.
- **Pronto quando:** os testes passam. Toda mudança de status no app passa por essa função.

#### M2.20 Pasta do processo

- **Fazer:**
  1. Criar `(cliente)/processos/[id]` e `(painel)/processos/[id]`, com componentes em comum.
  2. Criar as abas: Resumo, Documentos (pastas fixas e visualizador `react-pdf` carregado sob demanda), Mensagens, Decisões, Índice e Linha do tempo.
     - `react-pdf` 11.0.0 / PDF.js 6.3.289: worker, fontes, CMaps e WASM locais da mesma versão; `ssr: false` no wrapper cliente e `suspense={false}` para senha/cancelamento. Canvas/texto sem formulários ou links de anotação executáveis.
     - Visualização por `GET/HEAD /api/files/[id]/content`, com permissão e auditoria em cada requisição, transmissão por stream e suporte a Range. URL assinada de 120 s fica no servidor; download mantém seu link curto. Validação de 500 MB na Vercel continua pendente da nuvem.
  3. Se o usuário não tiver acesso, responder 404.
- **Pronto quando:** existe um e2e de navegação, e o cliente B recebe 404 no processo do A.

#### M2.21 Linha do tempo

- **Fazer:**
  1. Usar o helper SQL interno `private.record_event(...)` dentro da transação da RPC de cada caso de uso. Sem EXECUTE para os papéis da aplicação; não gravar o evento por uma segunda chamada do servidor.
  2. Mostrar a lista com ícones `lucide-react`, data e quem fez, com filtro por tipo.
  3. Aplicar filtro antes do limite e paginar com data original/UUID. Ao mudar o tipo, voltar às atividades recentes.
  4. Só o calculista registra notas; elas também aparecem ao cliente. RPC infere o autor, revalida acesso e registra nota/auditoria na mesma transação, com chave idempotente. Conteúdo de eventos é imutável.
- **Pronto quando:** os eventos de cadastro, proposta, aceite, pagamento, upload, mensagem, decisão e entrega aparecem.

#### M2.22 Mensagens

- **Fazer:**
  1. Criar o formulário com anexos, que vão para a pasta do cliente.
  2. Avisar a outra parte por e-mail (`new_message`) e o André também por WhatsApp.
  3. Atualizar com `revalidatePath`; não precisa de tempo real.
- **Pronto quando:** o e2e cobre ida e volta.

#### M2.23 Registro de decisões técnicas

- **Fazer:**
  1. Criar o formulário com:
     - parâmetro (lista: índice de correção, juros, marco inicial, período, verba, dedução, outro);
     - valor;
     - origem;
     - página;
     - justificativa.
  2. Seguir a RN-08: decisão sem página e sem confirmação do cliente aparece como "premissa".
  3. Autoria vem da sessão. RPC exclusiva do calculista valida acesso/campos, usa chave idempotente e registra decisão/evento/auditoria na mesma transação; conteúdo gravado é imutável.
  4. Só o cliente dono do processo confirma a concordância, com aceite explícito, ator/data registrados e evento/auditoria únicos; calculista não confirma em seu lugar. Repetir o registro original conserva a confirmação.
  5. Exportar em PDF em `GET /api/processes/[id]/decisions/pdf`: sessão/RLS, snapshot completo pelo banco, dados profissionais obrigatórios, cabeçalho/CRC e paginação; resposta privada sem cache. Auditoria `decisions_pdf_access` registra tentativa autorizada, não certifica geração concluída.
  6. Usar `@react-pdf/renderer` 4.9.0 e Source Sans 3 estática 5.3.1 com WOFFs locais incluídos no build; quebra visual de identificadores longos preserva o texto armazenado. Não herdar `lineHeight` na página: ensaio isolado mostrou rodapé dinâmico vazio com esse estilo. PDF não substitui parecer assinado.
- **Pronto quando:** existem testes, e o PDF lista as decisões com origem e página.

#### M2.24 Índice de páginas

- **Fazer:** criar a tabela editável, por versão do PDF, com:
  - peça: inicial, contestação, sentença, acórdão, decisão, ficha financeira, cartão de ponto, holerite, custas, cálculo anterior ou outra;
  - páginas, como texto ("120-135, 140");
  - observação.
  - Só o calculista cria/edita/remove; cliente dono lê. Referência pertence ao ID do PDF confirmado nas pastas Processo/Documentos do cliente. Uma versão nova começa com índice separado.
  - Páginas representam posições físicas do PDF, começando em 1. Parser/RPC aceitam inteiros de 1 a 100.000 e intervalos crescentes, até 100 referências/1.000 caracteres, sem expandir intervalos; observação até 2.000 caracteres. Não alegar validação contra a quantidade de páginas sem contagem confiável.
  - RPC revalida papel/acesso, trava arquivo antes da entrada, exige revisão atual e registra recibo privado/evento/auditoria na mesma transação. Replay usa payload original do recibo, mesmo após editar/remover; conteúdo diferente com a mesma chave exige recarregar/conferir. Recibos acompanham o ciclo de vida do processo.
  - Conflito de revisão usa `PT409` (HTTP 409), não `40001`: este provocava retries do PostgREST no ensaio. Arquivo indexado preserva conteúdo/identidade/versão; novas alterações exigem PDF disponível. Lista paginada de cinquenta com timestamp original/UUID e rótulos de formulário por `useId`.
- **Pronto quando:** dá para criar, editar e apagar, com teste.

#### M2.25 Fila do André

- **Fazer:**
  1. Em `(painel)/fila`, mostrar a tabela ordenada por `internal_due_date`, com pedido, cliente, tipo, complexidade, valor, situação do pagamento e status.
  2. Destacar o que vence em até 2 dias úteis e o que está atrasado.
  3. Filtrar por status.
- **Implementado localmente (2026-10-11):**
  - Estados operacionais de `queued` a revisão/ajuste, excluindo rascunho, triagem, aguardando sinal e terminais. Só calculista entra na fila; o administrador financeiro não recebe dados de processo.
  - Ordenação por data civil ASC NULLS LAST/UUID, cinquenta por página; cursor validado, filtro antes do limite e reinício ao trocar situação. Fila viva pode mudar entre páginas; nova leitura começa pelos primeiros pedidos.
  - Hoje é capturado uma vez por renderização em America/Sao_Paulo; data interna é exibida sem conversão de fuso. Destaque até o segundo dia útil usa calendário provisório, com aviso sobre feriados/suspensões do TRT.
  - Somente `deposit`/`balance` confirmados entram na soma em centavos; triagem, pendência e estorno não contam. Contrato não significa quitação.
- **Pronto quando:** existe um teste com dados de seed em várias situações.

#### M2.26 Entrega

- **Fazer:**
  1. No painel, criar o envio para a pasta Entregas: PDF do cálculo, .pjc, parecer em PDF e, se houver, DOCX ou XLSX.
  2. Criar o checklist de pré-juntada:
     - cálculo liquidado;
     - CPF ou CNPJ cadastrado no .pjc;
     - versão do PJe-Calc;
     - mês da tabela de índices.
  3. Com tudo marcado, fazer a transição para `delivered`, avisar o cliente e registrar na linha do tempo.
- **Implementado localmente (2026-10-11):**
  - Calculista confirma arquivos distintos, upload/SHA-256, versão/mês e revisão/assinatura/nome/CRC. Conteúdo do PJC e assinatura digital continuam sendo conferência humana; RF-62 é do M3.
  - Transação preserva snapshots profissionais/arquivos, entrega, estado, evento, auditoria e aviso enfileirado; locks por pedido/arquivo e chave idempotente impedem repetição e vínculo a dois pedidos concorrentes.
  - Entrega confirmada não implica download: D6 continua aberta. Sem política, cliente não recebe bytes; regra capturada por entrega impede liberação retroativa por mudança de settings. Despacho real do aviso depende de M2.28.
- **Pronto quando:** existe um e2e da entrega.

#### M2.26a Paginação das entregas

- **Fazer:** limitar o resumo a cinquenta entregas por página com navegação às anteriores/retorno às recentes, preservando microssegundos e desempate por UUID.
- **Pronto quando:** cliente e calculista recuperam mais de cinquenta registros uma única vez; cursor inválido e página vazia são tratados, em celular/computador.

#### M2.27 Download das entregas

- **Fazer:**
  1. Criar a rota no servidor que confere a permissão, gera a URL assinada de 120 s e grava no `audit_log`.
  2. Aplicar a regra do saldo (D6): se a entrega só sai depois do saldo, mostrar as instruções de pagamento.
- **Pronto quando:** o teste mostra o download registrado e o bloqueio quando a regra pede.

#### M2.28 E-mails transacionais e SMTP do login

- **Fazer:**
  1. Criar os modelos com React Email, em português:
     - `welcome`;
     - `new_signup` (André);
     - `quote_created` (cliente e André);
     - `quote_accepted`;
     - `payment_confirmed`;
     - `order_queued` (André);
     - `new_message`;
     - `deadline_reminder`;
     - `delivery_ready`;
     - `deletion_request`.
  2. Implementar o adaptador `email` da fila com o Resend.
  3. Sem domínio verificado, o Resend só envia para o próprio dono da conta, então os testes reais usam esse endereço. Em produção, o domínio precisa estar verificado (SPF, DKIM e DMARC no DNS, pelo Fábio, D3).
  4. Configurar no Supabase Auth o SMTP do Resend (o envio padrão do Supabase tem limite baixo) e os textos de confirmação, link de acesso e senha em português.
- **Pronto quando:** e-mails reais chegam na caixa de teste, e o login usa o SMTP do Resend.

#### M2.29 Alertas por WhatsApp ao André

- **Fazer:**
  1. Criar o adaptador `whatsapp` com a interface `send({to, template, vars})`.
  2. Implementar o provedor conforme D7:
     - **API oficial:** o Fábio cria a conta Meta Business, o número e o modelo de utilidade `alerta_pedido` em pt_BR. O envio é feito por `POST https://graph.facebook.com/<versão>/<phone_number_id>/messages`.
     - **Z-API:** a API deles.
  3. O conteúdo traz só o código do pedido e a data ("Pedido P-0001: entrega dia 22/10. Veja no painel."). Nunca número do processo, nome de parte ou documento.
- **Pronto quando:** o André recebe o alerta de teste no número dele.

#### M2.30 Lembretes de prazo

- **Fazer:**
  1. Criar a rota de cron `api/cron/deadlines`, de hora em hora.
  2. Buscar pedidos não entregues com prazo interno em 2 dias úteis, em 1 dia útil ou já atrasados.
  3. Enfileirar com `dedupKey` `deadline:{order}:{tipo}:{data}`.
  4. Enviar entre 7h e 21h, horário configurável.
- **Pronto quando:** existem testes com datas simuladas e não há aviso repetido.

#### M2.31 Preferências de notificação

- **Fazer:** em Configurações, criar a tabela de eventos por canal (e-mail, WhatsApp), ligado ou desligado, gravada em `notification_preferences`. O `enqueue` respeita a escolha.
- **Pronto quando:** um teste mostra que um canal desligado não recebe.

#### M2.32 Página inicial do painel

- **Fazer:** mostrar os cartões com a contagem de cadastros (7 dias), propostas abertas, aguardando pagamento, na fila, vencendo e atrasados, com links para as listas.
- **Pronto quando:** existe um teste com seed.

#### M2.33 Configurações do painel

- **Fazer:** criar as telas abaixo, só para calculista e admin.
  1. Editor da tabela de preços: salvar cria uma versão nova e ativa; o histórico continua visível.
  2. Dados do responsável técnico (nome, CRC, categoria), usados no site e nos PDFs.
  3. Chave Pix, contatos do André, folga, urgência, validade da proposta, horários de aviso e textos padrão (condições e garantia).
- **Pronto quando:** as mudanças aparecem no site e na proposta, e a versão antiga da tabela continua ligada às propostas antigas.

#### M2.34 Teste de ponta a ponta

- **Fazer:**
  1. Escrever um teste no Playwright com dois contextos (cliente e André), contra o Supabase local: cadastro, checklist, proposta, aceite, sinal, upload, mensagem, decisão, entrega e download.
  2. Rodar em 375 e 1440 px, com axe nas páginas principais.
  3. Criar no CI um job `e2e` com `supabase/setup-cli` e `supabase start`.
- **Pronto quando:** o job e2e fica verde no CI.

#### M2.35 Revisão de segurança

- **Fazer:**
  1. Carregar a skill `security-review`.
  2. Conferir:
     - RLS em todas as tabelas (advisors);
     - políticas do Storage;
     - validade das URLs assinadas;
     - `server-only` nos módulos de servidor;
     - nenhum segredo no bundle (só `NEXT_PUBLIC_` com a chave publicável);
     - cabeçalhos de segurança no `next.config`;
     - `npm audit`;
     - limites de tentativa do login no Supabase.
  3. Corrigir o que achar e registrar.
- **Pronto quando:** não há achado crítico ou alto aberto.

#### M2.36 Ensaio com o André

- **Fazer:**
  1. Em produção, depois do GATE M1, o André usa um processo antigo autorizado do começo ao fim.
  2. O agente anota cada problema como tarefa nova `[ ]` no marco certo. Dado real só em produção, nunca no repositório.
- **Pronto quando:** o ensaio está feito e os problemas viraram tarefas.

#### M2.37 Publicar no domínio

- **Fazer:**
  1. Configurar o domínio (D3) na Vercel. O Fábio cria os registros DNS no Registro.br.
  2. Conferir o HTTPS.
  3. Verificar o domínio no Resend.
  4. No Supabase Auth, atualizar o Site URL e as URLs de retorno.
  5. Criar `sitemap.xml` e `robots.txt`.
  6. Pedir a aprovação do Fábio antes de divulgar.
- **Pronto quando:** o domínio responde com HTTPS, os e-mails saem do domínio e o Fábio aprovou.

## Decisões do Fábio e do André

<!-- hub: ignorar -->

Os agentes trabalham com o padrão recomendado e deixam o item aberto até a confirmação. Ao decidir, marque `[x]` e escreva a escolha e a data.

- [x] **D1 Banco de dados:** Supabase Cloud em conta nova do cliente, projeto `qtofwbxujshroaafxowr` (decidido pelo Fábio em 2026-10-10). Recomendado: região São Paulo e plano Pro.
- [x] **D2 Hospedagem:** Vercel em conta nova do cliente (decidido pelo Fábio em 2026-10-10). Plano Pro, porque o Hobby não permite uso comercial; o Cloudflare foi avaliado e descartado.
- [ ] **D3 Marca, domínio e endereço provisório:** nome da nova empresa de perícia (formulário de marca). Até lá, a produção fica no endereço `.vercel.app`.
- [ ] **D4 Áreas no MVP:** só trabalhista (recomendado) ou já com cível e previdenciário.
- [ ] **D5 Caminho "Só o PDF" e reembolso:**
  - a taxa: R$ 150 a mais, como o André propôs, ou "triagem" que entrega o índice de páginas e é abatida do cálculo se o cliente fechar (recomendado pela pesquisa);
  - reembolso automático do sinal se o prazo estourar por culpa do prestador?
- [ ] **D6 Assinatura e liberação da entrega:**
  - parecer assinado com certificado ICP-Brasil (recomendado; a assinatura gov.br não vale para processo judicial);
  - o certificado do André é A1 ou A3?
  - a entrega é liberada antes ou depois do pagamento do saldo?
- [ ] **D7 WhatsApp:**
  - **recomendado:** API oficial do WhatsApp na conta Meta Business do cliente, com número dedicado. É do cliente e serve depois para os advogados.
  - **alternativa:** Z-API na conta do cliente, mais rápida de montar, mas não oficial.

  A Evolution API da VPS da Harmony não serve, porque não é do cliente.
- [ ] **D8 Retenção de documentos:** por quanto tempo guardar os PDFs depois da conclusão (sugestão: até o fim do processo, para reaproveitar nas atualizações, com exclusão a pedido).
- [ ] **D9 Cobrança e nota fiscal:** conta Asaas em qual CNPJ (nova empresa de perícia ou o atual do André) e como emitir nota.
- [ ] **D10 Prazos padrão:** entrega padrão de 3 dias úteis? Folga de 2 dias úteis antes do vencimento processual? Percentual de urgência?
- [ ] **D11 Pausa do prazo:** quando o pedido está "aguardando cliente", o prazo de entrega se estende pelo tempo de espera?
- [ ] **D12 Modelo de IA (M4):** `claude-opus-5-5` em todas as etapas (padrão) ou um modelo mais barato na triagem, depois de medir custo e acurácia.
- [ ] **D13 Acesso da administração aos documentos:** sem acesso por padrão (recomendado), com liberação pontual registrada.
- [ ] **D14 Cofres:**
  - o cofre `proj-andre-calculos`, que os agentes leem, fica só com chaves de desenvolvimento;
  - logins das contas do cliente e chaves de produção vão para um segundo cofre, `proj-andre-calculos-prod`, só de pessoas (recomendado).

  Até decidir, nenhuma credencial de conta ou de produção entra no cofre dos agentes.
- [x] **D15 Repositório:** organização Harmony-Digital no GitHub, `Harmony-Digital/andre-calculos`, privado (criado pelo Fábio em 2026-10-10 e transferido para a organização no mesmo dia). Na passagem, decidir se vai para o cliente.
- [ ] **D16 Conta-mãe e cobrança:**
  - Gmail novo do cliente (decidido), com 2FA por app autenticador e recuperação no celular e e-mail do André;
  - planos pagos no cartão do cliente;
  - depois, trocar o login para o e-mail do domínio.
- [ ] **D17 Ambiente local:**
  - **recomendado:** OrbStack (leve no Mac) ou Docker Desktop, para rodar o Supabase local completo (banco, login e arquivos);
  - **sem Docker:** desenvolver contra um segundo projeto do Supabase na nuvem, que custa à parte no plano Pro.

  Enquanto isso, o agente adianta as tarefas sem banco.

## Registro de Execução

| Data | Quem | Entregue | Pendências |
|---|---|---|---|
| 2026-10-10 | Claude Code | Transcrição da reunião com separação de falantes; pesquisa de concorrentes (`docs/pesquisa/reports/`); `PRD.md`, `plan.md`, `AGENTS.md` e `CLAUDE.md` | Decisões D1 a D13; cadastro no Hub; tabela de preços do André; início do M1 |
| 2026-10-10 | Claude Code | Padrão de segredos no 1Password: um cofre por projeto e contas de serviço só de leitura (`AGENTS.md` §7.1, `PRD.md` §11.7, frente "Segredos" no M1, D14) | Fábio criar o cofre e a conta de serviço do agente |
| 2026-10-10 | Claude Code e Fábio (Touch ID) | `scripts/configurar-1password.sh`: conta de serviço `sa-andre-calculos-agente` criada com leitura só em `proj-andre-calculos` (o cofre já existia); token nas Chaves do macOS; teste confirmou acesso só ao cofre do projeto | Itens do cofre entram conforme cada serviço for configurado; D14 |
| 2026-10-10 | Claude Code | Stack decidida (Vercel e Supabase em contas do cliente; GitHub na organização Harmony-Digital); `.mcp.json` com MCPs próprios do projeto; `.claude/settings.json` bloqueando MCPs de outras contas e comandos que revelam segredos; preflight de contas no início de toda sessão; `.gitignore`; PRD §11, AGENTS §7 e M1 atualizados | Fábio aprovar e autenticar os MCPs; decidir o áudio no primeiro commit antes do push |
| 2026-10-10 | Claude Code | Repositório transferido da conta pessoal para a organização: `Harmony-Digital/andre-calculos` (privado, vazio); origin local atualizado; preflight OK | Primeiro push depende da decisão sobre o áudio no commit `1d4e8ea` |
| 2026-10-10 | Claude Code | Plano reescrito para execução por agentes: IDs em todas as tarefas, "Insumos pendentes", "Ordem de execução", especificação passo a passo de todas as tarefas do M1 e do M2, tarefa `.00` de detalhamento no M3 a M6, D17 (ambiente local). Contas do Supabase e da Vercel do cliente registradas como criadas. Constatado: Docker ausente; CLIs da Vercel e do Supabase logadas em outras contas | Insumos do Fábio e do André listados em "Insumos pendentes" |
| 2026-10-11 | Codex | Documentação organizada (M1.11), fundação Next/rotas/fontes locais/health (M1.30–32); checklist/schema/CNJ, motores puros de preço/prazo/complexidade/estados; rascunhos legais; npm run check e 165 testes unitários aprovados, 22 e2e/axe em 375/1440 px; Colima exclusivo e Supabase local saudáveis; CI preparado | Não publicado; áudio bloqueado por revisão automática; OAuth do MCP Supabase dedicado aguardando login; migrations, seed e autenticação a seguir. npm audit --omit=dev sem achados; cinco alertas altos transitivos em ferramentas ESLint (braces sem versão corrigida disponível), registrar e acompanhar sem downgrade de Next. shadcn configurado pelo método manual para preservar os tokens próprios. |
| 2026-10-11 | Codex | Seed fictício (M1.40), SSR/roles/login/logout (M1.41/43), quatro migrations locais com RLS, Storage privado, TUS assinado, hash no servidor e download auditado (M1.42/44 e M2.18/20 parciais); npm run check verde com 186 unitários, 37 e2e/axe aprovados e um ensaio de 300 MiB omitido só no celular; 16 testes RLS, advisors e SQL lint sem achados; npm audit --omit=dev sem achados; imagens em docs/evidencias/autenticacao-arquivos. CI preparado com Supabase local e nenhum segredo de produção (M1.24) | Nuvem intacta; OAuth Supabase dedicado e decisão sobre áudio continuam pendentes. Textos legais ainda não aprovados, cadastro público desabilitado. Especificações atualizadas: cookies HttpOnly e upload assinado por caminho sem JWT no navegador; Storage sem SELECT direto para exigir auditoria; limite 500 MB; dev-env mantém chaves só em memória conforme AGENTS §7.1. Template 1Password e lista de variáveis preparados, ensaio com cofre ainda pendente. |
| 2026-10-11 | Codex | Cadastro/aceites versionados testados no Mailpit com fixture local (M2.04 parcial); perfil, senha, revogação em outro dispositivo e exclusão idempotente auditados (M2.06); aviso new_signup enfileirado sem CPF/CNPJ (M2.05); questionários de marca/preços preparados (M2.01/07 parciais). npm run check verde, 213 unitários, 17 RLS e 41 e2e aprovados, três ensaios únicos omitidos só no celular; advisors/lint SQL locais sem achados; imagens em docs/evidencias/cadastro-conta | Nuvem e publicação pendentes; rascunhos legais não liberam cadastro em produção. Fixture fixture-termos-v1/fixture-privacidade-v1 válida só com NODE_ENV não production, ANDRE_LOCAL_TESTS e URL local exata; settings restauradas no finally. Auth local passou a exigir confirmação e senha de 12 caracteres; limites ampliados servem apenas aos ensaios locais. CNPJ alfanumérico conforme manual da Receita Federal, vigente desde julho/2026. Próximo: persistência do checklist. |
| 2026-10-11 | Codex | Checklist salvo e retomado por etapa, revisão otimista, auditoria e linha do tempo (M2.08 parcial); pedidos continuam draft/zero e cliente B recebe 404; migrations locais 0008/0009, SQL lint/advisors sem achados; npm run check com 220 unitários, 19 RLS e 41 e2e aprovados, três ensaios únicos omitidos só no celular; imagens em docs/evidencias/checklist | Validação dos campos pelo André, preços e nuvem pendentes. Migration 0009 corrige qualificação de variável da RPC, descoberta pelo teste real; seed tem respostas fictícias válidas; normalização de CNPJ rejeita Unicode que se converteria em ASCII. Próximo: M2.33. |
| 2026-10-11 | Codex | Painel de configurações (M2.33 parcial), versões de preços e itens imutáveis, ativação concorrente e revisão de settings protegidas; dados profissionais/garantia aparecem no site, Pix não é público; limites do classificador carregados de settings (M2.11). Migrations locais 0010/0011, lint/advisors sem achados; npm run check com 232 unitários, 24 RLS e 44 e2e aprovados; quatro ensaios únicos omitidos só no celular; imagens em docs/evidencias/configuracoes | Nenhuma tabela fictícia ficou ativa e settings legais/profissionais foram restauradas no fim dos testes. Formulário volta a modo exemplo após salvar e exige confirmação a cada ativação. Nuvem, insumos do André, aprovação dos textos, snapshot da proposta e gates pendentes. |
| 2026-10-11 | Codex | Pasta com seis abas e quatro pastas fixas (M2.20), PDF privado sob demanda, senha efêmera, zoom/páginas/texto e rolagem por teclado; proxy autenticado HEAD/Range/206 auditado em migration local 0012; hash incremental do upload em blocos de 4 MiB (M2.18). SQL lint/advisors sem achados; npm run check com 245 unitários, 28 RLS e 49 e2e aprovados; cinco ensaios únicos omitidos só no celular; npm audit --omit=dev sem achados; imagens em docs/evidencias/pasta-processo | PDFs inteiramente fictícios com duas páginas, URI externa e OpenAction não causaram navegação/requisição/diálogo externo; senha fictícia não apareceu em requisições, console ou armazenamento do navegador. Upload de 300 MiB retomou dos 12 MiB e confirmou hash. Teste local do stream acima de 4,5 MB não substitui ensaio hospedado de 500 MB. Mensagens/decisões/índice ainda só exibem dados; seus formulários, notificações e exportação seguem em M2.22–24. Nuvem, insumos e gates continuam pendentes. |
| 2026-10-11 | Codex | Conversa privada e anexos da pasta do cliente (M2.22 parcial), formulário preservado após erro, retry sem duplicação, projeção de participantes e histórico paginado com microssegundos; mensagem/auditoria/evento/avisos atômicos e vínculos imutáveis dos anexos nas migrations locais 0013–0015. npm run check com 253 unitários/build, 37 RLS e 55 e2e aprovados; cinco ensaios únicos omitidos só no celular; SQL lint/advisors sem achados; imagens em docs/evidencias/mensagens | Avisos new_message enfileirados por canal conforme preferências, sem corpo/anexos no payload; despacho depende de M2.28/29. Resposta perdida após commit recuperou uma mensagem e uma auditoria. 112 mensagens com empates exatos e no mesmo milissegundo foram recuperadas sem perdas. Dados profissionais/legais restaurados, zero preços ativos e zero processos temporários de mensagens. Nuvem, áudio, insumos e gates continuam pendentes. |
| 2026-10-11 | Codex | Linha do tempo filtrada/paginada e notas do calculista compartilhadas com o cliente (M2.21 parcial); helper SQL transacional usado por rascunho/upload/mensagem, sem EXECUTE dos papéis da aplicação; conteúdo de eventos imutável, notas idempotentes/auditadas, índices nas migrations locais 0016–0017. npm run check com 255 unitários/build, 43 RLS e 59 e2e aprovados; cinco ensaios únicos omitidos só no celular; SQL lint/advisors sem achados; capturas em docs/evidencias/linha-do-tempo | Ensaio recuperou 112 notas depois de 105 uploads, com empates de microssegundos, filtro antes do limite e reinício da paginação ao trocar tipo. Sem avisos externos por notas. Settings profissionais/legais restauradas, zero preços ativos e zero processos temporários; papel calculista confirmado. Ajustados somente fins de arquivo das migrations 0014/0015. Eventos comerciais/decisões/entrega entram com seus casos de uso; nuvem, áudio, insumos e gates seguem pendentes. |
| 2026-10-11 | Codex | Registro imutável de decisões, premissa RN-08, concordância exclusiva do cliente e PDF privado (M2.23); RPCs com autoria inferida, idempotência, evento/auditoria atômicos nas migrations locais 0018–0019. npm run check com 259 unitários/build, 49 RLS e 63 e2e aprovados; cinco ensaios únicos omitidos só no celular; lint/advisors sem achados; capturas/PDFs fictícios em docs/evidencias/decisoes | Todas as seis páginas do ensaio longo e o PDF de uma página conferidos visualmente; 12 registros completos, mil caracteres sem perda, margens/rodapés/fontes locais verificados. lineHeight herdado provocava rodapé vazio e foi removido após reprodução isolada; página SQL opcional recebe default NULL. Settings/fixtures restauradas, zero preços ativos/processos temporários. Dados reais/CRC são insumos de publicação; nuvem, áudio e gates seguem pendentes. Próximo: M2.24. |
| 2026-10-11 | Codex | Índice por arquivo/versão com CRUD do calculista, cliente somente leitura, revisão concorrente e recibos privados imutáveis (M2.24); eventos/auditoria atômicos e paginação de cinquenta. Migrations locais 0020–0022, SQL lint/advisors sem achados; npm run check com 263 unitários/build, 55 RLS e 67 e2e aprovados; cinco ensaios únicos omitidos só no celular; capturas em docs/evidencias/indice | 61 referências com empates recuperadas; duas sessões não sobrescrevem revisão antiga; replays funcionam após remover entrada/arquivo; versão nova sem herança. Corrigidos escopo SQL e uso de PT409 para evitar retries, além de useId nos rótulos após criação. Dois processos de ensaios interrompidos limpos; zero processos temporários/recibos. Formato das páginas validado, sem alegar contagem real do PDF. Nuvem, áudio, insumos e gates seguem pendentes. Próximo: M2.25. |
| 2026-10-11 | Codex | Fila do André (M2.25), ordenação pelo prazo/UUID com nulos ao final, filtro antes do limite e situação de pagamentos confirmados; destaque por data civil de São Paulo/calendário provisório. Migration local 0023 com índices parciais; lint/advisors sem achados; npm run check com 267 unitários/build, 55 RLS e 71 e2e aprovados; cinco ensaios únicos omitidos só no celular. Capturas em docs/evidencias/fila | 116 pedidos fictícios recuperados sem perdas, 61 na revisão filtrada, inclusive cursor de prazo nulo; dados temporários removidos e settings/preços restaurados. Contraste dos rótulos corrigido e capturas conferidas. Nenhuma alteração de permissões. Calendário real do TRT, nuvem, áudio, insumos e gates seguem pendentes. Próximo: M2.26. |
| 2026-10-11 | Codex | Entrega conferida (M2.26): PDF/PJC/parecer e DOCX/XLSX, checklist explícito, snapshots profissionais/arquivos imutáveis, confirmação transacional/idempotente, evento/auditoria/aviso enfileirado. Migrations locais 0024–0026; lint/advisors sem achados; npm run check com 269 unitários/build, 61 RLS e 75 e2e aprovados; cinco ensaios únicos omitidos só no celular; capturas em docs/evidencias/entrega | Dois pedidos disputando arquivos tiveram um vencedor sem deadlock; falhas não deixaram efeitos parciais. Política pendente bloqueia cliente, saldo confirmado libera, estorno bloqueia nova leitura; URL de 120 s e auditoria verificadas. Corrigida visibilidade de metadados pendentes do calculista para TUS e exibição do mês/estilos. Dados profissionais/legais/preços restaurados e zero processos/entregas temporários. D6, despacho real, nuvem, áudio e gates seguem pendentes. Próximo: completar M2.27 local. |
| 2026-10-11 | Codex | Paginação de entregas no resumo (M2.26a), cinquenta por página com cursor data/UUID sem conversão por Date e retorno às recentes. npm run check com 269 unitários/build; dois e2e novos em 375/1440 px e quatro fluxos de entrega repetidos aprovados | Todos os 61 registros fictícios com empates exatos/diferença de um microssegundo recuperados por cliente e painel; cursor inválido recebe 404, página vazia volta ao início, axe/largura passaram. Sem migration nem alteração de permissões. Evidência: docs/evidencias/entrega/README.md. Próximo: M2.27. |

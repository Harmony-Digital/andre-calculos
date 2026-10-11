# Validação das conexões dedicadas — 2026-10-11

Ensaio de leitura pelo Codex CLI 0.159.0, usando o App Server documentado em processo separado, contexto efêmero e sem turno de modelo. Somente `andre-calculos-supabase` e `andre-calculos-vercel` habilitados no processo de teste. Nenhuma configuração global persistente foi alterada pelo diagnóstico.

O Fábio concluiu novamente os dois OAuth. Ambos os comandos `codex mcp login` terminaram com código zero e `Successfully logged in`. O fluxo posterior da Vercel também terminou com código zero. Não foram copiados tokens, URLs de autorização, cookies ou cabeçalhos para esta evidência.

## Primeira validação após OAuth

| Conexão | Descoberta | Chamada real | Resultado |
|---|---|---|---|
| `andre-calculos-supabase` | OAuth; servidor Supabase 0.13.0; 20 ferramentas | `get_project_url({})` | `https://qtofwbxujshroaafxowr.supabase.co`, igual ao projeto esperado |
| `andre-calculos-vercel` | OAuth; Vercel MCP Server 0.1.0; 238 ferramentas | `list_teams({})` | `teams: []`; zero equipes |
| `andre-calculos-vercel` | Mesmo MCP | `get_team({"teamId":"team_4fdLDCsB0ROvP5ph50aFNvxm"})` | `isError: true`, código `forbidden`, status HTTP 403, operação `GET /v2/teams/{teamId}` |

O Team ID foi informado diretamente pelo Fábio, a partir da equipe esperada Projeto Andre (`projeto-andre1`). O MCP recusou sua leitura; portanto nome, slug e acesso à equipe não foram confirmados por ele. `get_auth_user` também retornou erro e não confirmou a identidade da conta. OAuth e descoberta de ferramentas, isoladamente, não demonstram acesso aos recursos.

## Conferência no navegador e repetição

O navegador confirmou a conta `projetoandre.harmony@gmail.com`, usuário `projetoandreharmony-7280`, e a equipe Projeto Andre, slug `projeto-andre1`, Team ID `team_4fdLDCsB0ROvP5ph50aFNvxm`. A conta aparece como Owner dessa equipe e o plano exibido é Hobby. Isso confirma o destino esperado na interface; não demonstra acesso do MCP nem conclui M1.05.

A aplicação conectada aparece como “An MCP client”, da Vercel MCP. A revisão automática recusou a revogação de todos os tokens dessa aplicação; a confirmação foi cancelada e nenhum token foi revogado pelo agente. Uma tentativa de selecionar a equipe no consentimento também foi recusada por envolver permissões além da leitura. Depois, Fábio autorizou explicitamente as 35 permissões mostradas, exclusivamente para Projeto Andre, incluindo escrita em projetos/deploys, variáveis, domínios, billing/compras, membros e armazenamento. Essa autorização permite concluir o consentimento para Projeto Andre; não autoriza executar operações de produto. A concessão efetiva das 35 permissões ainda não foi confirmada pelo ensaio.

O fluxo OAuth que estava aberto terminou com `Successfully logged in`. A repetição real pelo App Server manteve os resultados: Supabase respondeu à URL esperada; Vercel descobriu 238 ferramentas, `list_teams` retornou `teams: []` e `get_team` do ID esperado retornou `forbidden`, HTTP 403. A autorização recebida e a conclusão do login não demonstraram a correção do acesso à equipe.

Uma falha intermediária de descoberta ocorreu nos dois servidores; a repetição recuperou vinte ferramentas Supabase e 238 Vercel. Nas tentativas seguintes de abrir um novo consentimento, `codex mcp login andre-calculos-vercel` falhou ao consultar `https://vercel.com/.well-known/oauth-authorization-server`. `curl` ao mesmo endpoint retornou erro 6, “Could not resolve host: vercel.com”; os metadados públicos de `mcp.vercel.com` responderam HTTP 200. A consulta DNS direta de `vercel.com` respondeu com dois registros A, mas `dscacheutil -q host -a name vercel.com` não retornou endereço. Não foram alterados servidores DNS, VPN ou rede. Foi solicitada aprovação para uma tentativa de limpeza somente do cache DNS local; a causa definitiva do HTTP 403 permanece indeterminada.

Não foram consultados projetos da Vercel, tabelas ou documentos do Supabase. As chamadas dos MCPs foram somente de leitura; não houve migration, deploy, variável, cobrança, mudança de plano ou mensagem externa. OAuth e consentimento foram tratados conforme a autorização específica acima. Os MCPs de outros clientes não foram usados. A recuperação sugerida na resposta do servidor não foi executada por CLI/API alternativa.

As ferramentas dedicadas não constavam no catálogo nativo deste chat no momento do teste. O resultado acima corresponde a chamadas reais dos MCPs pelo cliente oficial separado, não à simples leitura da configuração.

Fontes do procedimento: [MCP no Codex](https://developers.openai.com/codex/mcp), [protocolo do App Server](https://learn.chatgpt.com/docs/app-server#protocol), [MCP do Supabase](https://supabase.com/docs/guides/ai-tools/mcp), [get_team da Vercel](https://vercel.com/docs/agent-resources/vercel-mcp/tools/teams/get_team). A causa específica da recusa da Vercel não foi estabelecida pelo ensaio.

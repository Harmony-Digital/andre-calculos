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

A aplicação conectada aparece como “An MCP client”, da Vercel MCP. A revisão automática recusou a revogação de todos os tokens dessa aplicação; a confirmação foi cancelada e nenhum token foi revogado pelo agente. Uma tentativa de selecionar a equipe no consentimento também foi recusada por envolver permissões além da leitura. Depois, Fábio autorizou explicitamente as 35 permissões mostradas, exclusivamente para Projeto Andre, incluindo escrita em projetos/deploys, variáveis, domínios, billing/compras, membros e armazenamento. Essa autorização permite concluir o consentimento para Projeto Andre; não autoriza executar operações de produto. Até esse ponto, a concessão efetiva das 35 permissões ainda não tinha sido confirmada pelo ensaio.

O fluxo OAuth que estava aberto terminou com `Successfully logged in`. A repetição real pelo App Server manteve os resultados: Supabase respondeu à URL esperada; Vercel descobriu 238 ferramentas, `list_teams` retornou `teams: []` e `get_team` do ID esperado retornou `forbidden`, HTTP 403. A autorização recebida e a conclusão do login não demonstraram a correção do acesso à equipe.

Uma falha intermediária de descoberta ocorreu nos dois servidores; a repetição recuperou vinte ferramentas Supabase e 238 Vercel. Nas tentativas seguintes de abrir um novo consentimento, `codex mcp login andre-calculos-vercel` falhou ao consultar `https://vercel.com/.well-known/oauth-authorization-server`. `curl` ao mesmo endpoint retornou erro 6, “Could not resolve host: vercel.com”; os metadados públicos de `mcp.vercel.com` responderam HTTP 200. A consulta DNS direta de `vercel.com` respondeu com dois registros A, mas `dscacheutil -q host -a name vercel.com` não retornou endereço. Não foram alterados servidores DNS, VPN ou rede. Foi solicitada aprovação para uma tentativa de limpeza somente do cache DNS local; a causa definitiva do HTTP 403 permanece indeterminada.

## Consentimento final e validação nativa

Fábio autorizou limpar somente o cache DNS do Mac. `sudo -n dscacheutil -flushcache` terminou com código 1, “a password is required”; nenhum cache foi limpo e `killall -HUP mDNSResponder` não foi executado. Antes de solicitar execução manual, uma nova consulta ao endpoint público OAuth de `vercel.com` retornou HTTP 200. A resolução voltou sem alteração de servidores DNS, VPN ou rede, e sem limpeza de cache pelo agente. Não foi necessário pedir senha ou executar uma intervenção manual.

Os dois MCPs dedicados passaram a estar disponíveis diretamente neste chat. Antes do consentimento final, as chamadas nativas reproduziram a URL Supabase correta, lista Vercel vazia e HTTP 403 para o Team ID esperado.

Foi aberto um novo fluxo `codex mcp login andre-calculos-vercel` no navegador já autenticado como `projetoandre.harmony@gmail.com`. O agente selecionou exclusivamente Projeto Andre. A opção “Access to all current and future projects” ficou desmarcada (`checked: false`), e a tela informou “This team has no projects”. Uma primeira confirmação “Authorize” foi recusada pela revisão automática por possível acesso amplo a projetos; após comprovar o estado desmarcado por DOM/captura, a mesma confirmação foi aceita mantendo a restrição. A equipe passou a aparecer como “Projeto Andre Authorized Configure”; o agente clicou “Allow Access” conforme a autorização explícita do Fábio. O comando terminou com código zero e `Successfully logged in`.

| MCP dedicado no chat | Chamada real após o consentimento final | Resultado |
|---|---|---|
| `andre-calculos-supabase` | `get_project_url({})` | `https://qtofwbxujshroaafxowr.supabase.co` |
| `andre-calculos-vercel` | `list_teams({})` | Uma equipe: `Projeto Andre`, slug `projeto-andre1`, ID `team_4fdLDCsB0ROvP5ph50aFNvxm` |
| `andre-calculos-vercel` | `get_team({"teamId":"team_4fdLDCsB0ROvP5ph50aFNvxm"})` | `isError: false`; mesmo nome, slug e ID |
| `andre-calculos-vercel` | `list_projects({"teamId":"team_4fdLDCsB0ROvP5ph50aFNvxm"})` | `projects: []`, contagem zero |

`bash scripts/preflight.sh` terminou com código zero: GitHub `fabioalmeidadigital`, remoto Harmony-Digital/andre-calculos e conta de serviço com somente o cofre `proj-andre-calculos`. `VERCEL_TEAM` e `VERCEL_TEAM_ID` estão no arquivo local de metadados; Supabase permanece limitado ao projeto esperado. A validação usou o MCP dedicado, sem CLI alternativa da Vercel e sem credencial de outro cliente.

Capturas locais da seleção e da conexão ativa foram apresentadas no chat, sem salvar URLs de autorização ou códigos de callback no repositório. O Chrome bloqueou a página local de retorno, mas o cliente recebeu a autorização e as chamadas reais acima comprovaram o acesso; não foi contornada nenhuma proteção do navegador.

As chamadas dos MCPs foram somente de leitura; a única mudança externa foi o consentimento explicitamente autorizado. Não houve migration, leitura de tabelas/documentos Supabase, criação de projeto, deploy, variável, cobrança, mudança de plano ou mensagem externa. A consulta de projetos limitou-se à equipe confirmada. Os MCPs de outros clientes não foram usados. A recuperação sugerida na resposta do servidor não foi executada por CLI/API alternativa.

As ferramentas dedicadas não constavam no catálogo nativo deste chat na primeira tentativa; esse ensaio usou chamadas reais dos MCPs pelo cliente oficial separado. A validação final usou as ferramentas nativas após sua disponibilização.

Fontes do procedimento: [MCP no Codex](https://developers.openai.com/codex/mcp), [protocolo do App Server](https://learn.chatgpt.com/docs/app-server#protocol), [MCP do Supabase](https://supabase.com/docs/guides/ai-tools/mcp), [get_team da Vercel](https://vercel.com/docs/agent-resources/vercel-mcp/tools/teams/get_team). A causa específica da recusa da Vercel não foi estabelecida pelo ensaio.

## Diagnóstico de visibilidade após criação do projeto

Em 2026-10-11, a pedido do Fábio, foram repetidas somente chamadas de leitura no MCP `andre-calculos-vercel`:

- `list_teams`: somente Projeto Andre, slug `projeto-andre1`, ID `team_4fdLDCsB0ROvP5ph50aFNvxm`.
- `list_projects` com essa equipe: `projects: []`, contagem zero.
- `get_project` com `idOrName: prj_tdmzmC6utVU2fHPz0iVhroMD8NtI` e a equipe esperada: HTTP 404, `not_found`, "Project not found".

Esses resultados confirmam conexão/autenticação à equipe e ausência de visibilidade do recurso por essa credencial. Não comprovam exclusão do projeto nem a causa do 404. A concessão anterior à criação, com acesso a projetos futuros desmarcado, é uma hipótese compatível; deve ser conferida na autorização do recurso. Nenhum grant, escrita, CLI de outra conta ou operação no navegador foi executado. O nome da conexão que aparece ao Fábio foi solicitado antes de avaliar outra conexão.

A documentação [Scopes and Permissions](https://vercel.com/docs/sign-in-with-vercel/scopes-and-permissions) distingue permissões da equipe e de projetos autorizados. A URL específica de um projeto no MCP fornece contexto e não comprova concessão de acesso. O status fica exclusivamente no plan.md.

## Verificação das duas conexões a pedido do Fábio

Fábio determinou priorizar MCP. Foram consultadas as duas conexões disponíveis, somente por leitura e com identidade da equipe conferida antes das consultas do projeto:

| Operação | `andre-calculos-vercel` | `vercel` |
|---|---|---|
| list_teams | Somente Projeto Andre / projeto-andre1 / team_4fdLDCsB0ROvP5ph50aFNvxm | Mesma equipe, nenhuma outra |
| list_projects nessa equipe | projects vazio, count zero | Mesmo resultado |
| get_project por ID esperado | 404 not_found / Project not found | Mesmo resultado |
| list_deployments por equipe/projeto esperados, limit 3 | 403 forbidden / You don't have permission to list the deployment. | Mesmo resultado |

O dedicado também respondeu 404 na consulta por nome `andre-calculos`. Request IDs: get_project dedicado `gru1:sfo1::qcftj-1791739567518-660fdc7b3d65`, conexão vercel `gru1:sfo1::8wvqp-1791739569177-dc675e0755a0`; list_deployments dedicado `gru1:sfo1::8bpqc-1791739619446-6755322d2098`, conexão vercel `gru1:sfo1::65scv-1791739619449-13e498bdca11`.

O 403 confirma recusa de permissão para listar deploys; a causa da ausência de acesso ao projeto não foi estabelecida. Não houve repetição do erro sem mudança de estado, reconexão automática, navegador, CLI Vercel, API alternativa, concessão ou escrita externa. Reautenticar, por si só, não foi considerado solução comprovada.

A operação create_deployment do MCP aceita arquivos de código. Preparado apenas localmente `.data/publicacao/deployment-mcp.json`, ignorado pelo Git, com equipe/ID esperados, target production e os 158 arquivos base64 do ZIP conferido contra main `9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd`. Sem env vars ou projectSettings. O envio exige antes get_project confirmar o ID esperado na equipe correta; a revisão de acesso deve limitar-se a esse recurso. Publicação e jornada hospedada ainda não foram verificadas.

# Retirada da transcrição e publicação do histórico limpo — M1.10a

Em 2026-10-11, Fábio autorizou retirar a transcrição de todo o histórico Git, preservar o original local e tornar `Harmony-Digital/andre-calculos` público.

O filtro dos caminhos `Transcricao - Reuniao Fabio e Andre.md` e `docs/transcricao-reuniao-2026-10-10.md` foi executado em cópia bare temporária. Foram comparados 27 commits: os demais arquivos, autores, datas, mensagens e relações entre pais permaneceram iguais. O [mapa dos SHAs](historico-sem-transcricao.tsv) relaciona as evidências anteriores aos commits filtrados.

Também foram conferidas duas árvores de snapshot do Codex. As cinco referências locais foram trocadas atomicamente, com comparação dos SHAs anteriores, sem importar backups do filtro. Nenhum caminho ou blob da transcrição é alcançável pelas referências. Não houve checkout, reset ou coleta de lixo dos arquivos locais.

## Original local

- Arquivo: `docs/transcricao-reuniao-2026-10-10.md`, ignorado pelo Git.
- Tamanho antes/depois: **41.565 bytes**.
- SHA-256 antes/depois: `e8ff9ae73732e6e4036517f10fe29d407f2fddb4845bcf7c46df4a380eed8a13`.
- O áudio original também conservou os 19.552.708 bytes e o SHA-256 registrado em [retirada do áudio](retirada-audio.md).

## Separação dos caches antigos

A `main` privada foi atualizada de `cc34885848e694887e7da7be626e87d2e037118a` para `5c6a38b13a37c694fac4076f19d35d821071d884`, usando lease com o SHA anterior explícito. A API ainda permitia consultar o commit antigo e sua árvore com o blob da transcrição. Isso confirmou que o force-push não eliminou o cache.

Antes da troca de repositório foram conferidos: zero forks, PRs, issues, webhooks, deployments, deploy keys, equipes, releases, tags, ambientes, segredos e variáveis de Actions; Pages ausente; único colaborador direto `fabioalmeidadigital`. Nenhuma integração de deploy existente foi transferida ou desligada.

O repositório antigo, ID `1413659875`, foi renomeado para `Harmony-Digital/andre-calculos-arquivo-privado-20261011`, conservado **privado** e arquivado. Não foi excluído. O histórico de Actions pertence a esse arquivo privado.

Foi criado um repositório independente, vazio e inicialmente privado em `Harmony-Digital/andre-calculos`, ID `1414349093`, com `fork: false`. Somente a `main` filtrada foi enviada. Um clone bare independente confirmou os 25 commits da branch e a ausência dos caminhos e blobs do áudio/transcrição. Consultar o commit antigo no novo repositório retornou HTTP 404, mesmo para o administrador.

O novo repositório foi então tornado público. As verificações sem credencial retornaram:

| Consulta                                       | HTTP         |
| ---------------------------------------------- | ------------ |
| Metadados do novo repositório, ID `1414349093` | 200, público |
| Commit antigo no novo repositório              | 404          |
| Metadados do arquivo privado                   | 404          |
| Commit antigo no arquivo privado               | 404          |
| Transcrição no endereço raw antigo             | 404          |

Essa operação isolou o histórico publicado. **Não é uma purga física dos objetos e caches antigos no GitHub**: eles permanecem restritos ao repositório privado. A documentação oficial prevê suporte do GitHub para essa purga; nenhum pedido ou mensagem foi enviado. Referências: [remoção de dados sensíveis](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository), [renomeação](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository) e [arquivamento reversível](https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories).

## Proteção aplicada

O ruleset `24880297` foi criado e lido novamente pela API. Ele é ativo somente em `refs/heads/main`, exige PR e os checks `qualidade`/`e2e` do GitHub Actions (integração `15368`), com atualização estrita e sem atores de bypass. A consulta de regras efetivas da `main` confirmou ambas as exigências. O resultado dos testes e o andamento das tarefas são registrados somente em `plan.md`.

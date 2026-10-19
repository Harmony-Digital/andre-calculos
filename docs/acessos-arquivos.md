# Consulta de acessos a arquivos

Na área do calculista, André abre **Acessos a arquivos** (`/painel/acessos`). A consulta apresenta autor, horário de São Paulo, ação e referência do arquivo. Os registros mais recentes aparecem primeiro, em páginas de até 50 itens.

## Como consultar

- **Arquivo:** parte do nome ou identificação completa. O nome em cada registro também filtra pelo identificador exato, incluindo referências que já não estão disponíveis.
- **Autor do acesso:** parte do nome ou identificação completa. O nome do autor permite aplicar o filtro exato.
- **Data inicial e final:** opcionais; o período inclui os dois dias inteiros no fuso `America/Sao_Paulo`.
- **Ação:** todas, visualização autorizada ou download autorizado.

**Consultar acessos** aplica os filtros e volta ao começo. **Próximos registros** conserva a seleção e avança pela combinação de data e UUID, sem arredondar microssegundos. **Registros recentes** volta ao começo da mesma seleção; **Limpar filtros** abre a consulta geral. Uma seleção sem resultados informa isso explicitamente; filtros inválidos e falhas de consulta mostram mensagem própria.

## O que o registro comprova

`file_view` corresponde à autorização de visualização. Requisições GET, HEAD e Range do PDF recebem essa mesma classificação; o histórico existente não distingue esses métodos. `file_download` corresponde à autorização para baixar. A auditoria antecede a resposta do armazenamento: ela não comprova leitura humana nem transferência completa, e pode existir mesmo que a transferência falhe depois.

Os nomes e a versão do arquivo vêm do cadastro atual. Se a referência foi removida, a consulta preserva o registro e a identificação, com **Arquivo indisponível** ou **Autor indisponível**. Não representa um snapshot histórico do nome. Uploads e eventos do contrato associados à proposta não são classificados como leitura de arquivos nesta consulta.

## Permissões e dados

A página e o caso de uso exigem o papel `calculator`. A RPC `get_file_access_audit` repete a autorização no banco e permite apenas `file_view`/`file_download` de `target_type='file'`. Cliente, outro cliente, admin, anônimo e papel de sistema não executam essa RPC. A consulta usa a sessão autenticada, sem cliente administrativo.

A migration `0114` restringe também o SELECT legado de eventos de arquivo para que o admin não contorne a nova consulta; as demais auditorias administrativas conservam suas permissões. A decisão D13 continua aberta, com o padrão de admin sem acesso aos documentos. Nenhuma outra política de acesso documental é ampliada.

O retorno da RPC contém somente identificadores de referência, data, ação, nome do autor, nome e versão do arquivo. Não inclui IP, conteúdo, caminho/bucket, token, URL assinada ou payload bruto. A resposta passa por um DTO estrito antes de chegar à interface.

## Verificação dirigida

Com o runtime local exclusivo do projeto ativo, a partir da raiz:

```sh
bash scripts/dev-env.sh npm run test:rls -- tests/integration/file-access-audit.test.ts
bash scripts/dev-env.sh npm run test:e2e -- tests/e2e/file-access-audit.spec.ts --workers=1 --retries=0
```

As fixtures são fictícias e limpas ao terminar. Não executar esses ensaios em paralelo com outro escritor do banco. O teste de navegador realiza acesso completo, HEAD, Range e download privados; consulta o resultado na visão do calculista e verifica filtros, paginação, acessibilidade e recusas aos demais perfis em celular e computador. O teste de banco cobre empates de horário com microssegundos, limites de dias, referências ausentes, payload seguro e permissões. Status e continuidade ficam exclusivamente em [plan.md](../plan.md#onde-estamos).

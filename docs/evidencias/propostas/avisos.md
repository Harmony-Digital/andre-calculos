# Conferência do aviso de orçamento (M2.14)

Ensaios em 2026-10-11 no Supabase local exclusivo `andre-calculos`, com usuários,
propostas, pedidos e contatos inteiramente fictícios. Nenhum provedor recebe
requisições de envio.

## Comportamentos verificados

- Proposta legada sintética sem aceite cria `quote_created` na fila. E-mail
  começa ligado e WhatsApp exige opt-in. O estado do pedido não muda.
- Payload exato: identificadores, número, código e caminho da pasta no painel.
  Não contém CNJ, documentos, nome do cliente, itens ou condições. Status
  `pending`, zero tentativas e `sent_at` vazio comprovam somente enfileiramento.
- Uma inserção concorrente pode ser recusada pela chave única do número.
  O vencedor e o replay posterior produzem no máximo um aviso por canal.
  Atualizar a proposta não dispara o trigger novamente.
- Canal desligado, vínculo ausente, responsável sem papel de calculista ou
  contato ausente não criam aviso. Alterações posteriores não recuperam a
  ocorrência antiga.
- Duas sessões PostgreSQL comprovaram bloqueio real: a inserção aguardou a
  transação de preferências segurando o vínculo. Após o commit, apenas WhatsApp
  foi enfileirado, conforme as escolhas confirmadas dos dois canais.
- Falha injetada no segundo canal reverte proposta e primeiro aviso. A repetição
  após remover a falha cria exatamente dois avisos.
- Cliente A/B, calculista, admin e anônimo não inserem proposta/aviso nem leem a
  fila. A função de trigger não concede execução a `anon`, `authenticated` ou
  `service_role`; roda exclusivamente pelo trigger.
- Propostas simuladas nunca entram na fila. A suíte da RPC e o navegador também
  conferem zero avisos após gerar a proposta fictícia do checklist e recuperar
  sua resposta perdida.

O teste positivo usa exclusivamente o formato legado com snapshot vazio e
marcador `TESTE-M2.14-<uuid>`, em pedido temporário próprio. Nenhuma constraint
foi flexibilizada para permitir emissão comercial pela RPC. Os ensaios do
dashboard também usam dados legados e têm limpeza por processo, incluindo os
avisos com `data.process_id`.

## Verificação

```sh
bash scripts/dev-env.sh npm run check
bash scripts/dev-env.sh npm run test:rls
bash scripts/dev-env.sh npm run test:e2e -- --workers=2 tests/e2e/quotes.spec.ts tests/e2e/dashboard.spec.ts tests/e2e/notification-preferences.spec.ts
DOCKER_HOST='unix:///Users/fabioalmeida/.colima/andre-calculos/docker.sock' supabase db lint --local --level warning
```

A migration local `0035` mantém RLS nas tabelas e `search_path` vazio na função
`SECURITY DEFINER`. Lint SQL não encontrou erros. O catálogo confirmou um único
trigger e ausência de execução direta pelos três papéis acima.

Esta conferência cobre a fila local. A emissão comercial depende dos insumos de
M2.12; despacho e produção seguem as verificações específicas dos provedores e
da conexão dedicada. Advisors da nuvem não foram executados nesta sessão.
Andamento e contagens finais ficam no `plan.md`.

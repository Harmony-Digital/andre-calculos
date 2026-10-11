# Ensaio do aviso de sinal ao cliente — 2026-10-11

Migrations0056/0057 aplicadas somente ao PostgreSQL local. `confirm_manual_deposit` enfileira `payment_confirmed` quando cria crédito positivo de sinal. Destinatário vem do proprietário do cliente, com papel cliente e e-mail disponível. Payload contém somente `order_id`, `process_id` e `code`; a chave é `payment:<paymentId>:client:email`. O modelo existente reconstrói o link autenticado para a pasta.

Pagamento, intenção, recibo, mudança de estado, timeline, auditoria e aviso são transacionais. Falha do aviso ou contato inválido reverte o crédito novo. Replay retorna o recibo histórico; conciliação de valor zero não cria pagamento ou aviso. Estorno seguido de crédito novo tem outra chave. As permissões, guardas comerciais, simulações e contratos permanecem protegidos.

A revisão da0056 encontrou inversão de locks com a edição do perfil. A0057 adquire o perfil proprietário antes do cliente, reconfere a propriedade depois do lock e conserva a validação de contato apenas no crédito novo. O ensaio concorrente observa o backend realmente bloqueado antes de liberar a edição. A sessão auxiliar tem limites SQL de oito segundos.

## Verificações executadas

```sh
bash scripts/dev-env.sh npm run test:rls -- --reporter=dot
bash scripts/dev-env.sh npm run test:rls -- tests/integration/deposit-client-notice.test.ts tests/integration/manual-deposit.test.ts
bash scripts/dev-env.sh supabase db advisors --local --workdir .. --type security --level warn --fail-on error
bash scripts/dev-env.sh supabase db advisors --local --workdir .. --type performance --level warn --fail-on error
bash scripts/dev-env.sh supabase db lint --local --workdir .. --schema public,private --level warning --output json
```

Suíte geral: 383 testes/23 arquivos aprovados. Após ampliar os dois cenários de contato inválido e limitar a sessão auxiliar, o conjunto específico passou novamente: 26 testes/2 arquivos, incluindo 13 do aviso. Os cenários cobrem documentos antes/depois do sinal, concorrência de intenções, replay, estorno, parcela restante, zero, falha transacional, ausência de contato/papel, permissões, imutabilidade de proposta, simulação, contrato e reserva/replay real da fila. Replay histórico e conciliação zero foram executados também com e-mail ausente e com proprietário de papel divergente.

Advisors locais de segurança/desempenho: `No issues found`. Lint SQL não apresentou erro no caso alterado; apontou oito avisos preexistentes de variáveis sombreadas/não usadas em `private.valid_signup_cpf`/`private.valid_signup_cnpj`, fora deste recorte. Read-back: 57 migrations; 25 tabelas públicas/22 internas, todas com RLS; zero intenções/recibos de sinal, avisos de pagamento, reservas/recibos de despacho, triggers temporários e sessões auxiliares restantes após a limpeza.

`npm run check` local aprovou formato, lint, tipos, 461 testes unitários/44 arquivos e 43 testes de scripts. Build encontrou a restrição preexistente `EPERM` na porta interna do Turbopack; não é evidência de build aprovado. Após o refinamento dos testes, formato/lint/tipos passaram novamente. Duas revisões independentes por leitura não encontraram bloqueador na0057.

Não houve chamada ou configuração de transporte externo. A reserva da fila congela o snapshot; integração futura precisa revalidar destinatário, vínculo e público antes do envio. Este ensaio não comprova envio/recebimento, SMTP, cron, configuração Auth, aplicação de migrations na nuvem ou publicação. Os modelos de boas-vindas e outras variantes sem produtor não foram vinculados por esta entrega.

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

O mesmo código passou no `npm run check`/build remoto do [CI38178146136](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38178146136), job qualidade114584808935, fonte `34fbd3342baeec5546b156dc11c8ee677a4271af`: 461 unitários/44 arquivos, 43 testes de scripts, formato/lint/tipos e build Next.js16.4. Checkout `5e39ba39e6b1fb36f480141298c04133c9f682ec` conferido com pais main `9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd` e a fonte. A leitura removeu os escapes ANSI antes de conservar somente linhas de validação, com SHA-256 `bd4cbb6c4dc31884d04e5fc3fed38a353b6170a2a84ee14adcbe96a9615f813f`. Fonte do [PR #15] nesta rodada(https://github.com/Harmony-Digital/andre-calculos/pull/15) conferida e preservada; suíte geral remota terminou com 382/383 testes de banco aprovados: o teste concorrente falhou ao tratar `phone` nulo no seed limpo. Navegador e advisors remotos não executados nessa rodada.

A correção do ensaio fornece telefone fictício válido quando ausente e restaura, em `finally`, os cinco campos originais do perfil e o nome original do cliente, inclusive telefone nulo. O ensaio agora tem dois estados iniciais: perfil preenchido e perfil mínimo com telefone nulo. Uma rodada intermediária passou 383/384 testes de banco e identificou que `legal_name` é NOT NULL: a tentativa de nulificar esse campo foi retirada; o caso mínimo reproduz somente o telefone nulo. O conjunto final específico passou com 27 testes/2 arquivos, incluindo 14 do aviso e os dois estados do perfil; revisão do delta sem bloqueador. Migrations e caso de uso permaneceram idênticos. A confirmação da nova fonte no CI está descrita abaixo.

Na fonte corrigida `5d3db8a1f63758e0a619605052f30e60e3af1153`, [CI38178835637](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38178835637), job qualidade114586864386, `npm run check`/build passaram: 461 unitários/44 arquivos e43 scripts. Checkout `8d74e4e2f6132189589b192264286b4ef1a2b65a` confirmado com pais main9a25f31 e fonte5d3db8a; log de validação sanitizado SHA-256 `929e55c55450462b521e5036b94968f9de09ee39c4eed9f0afc46825776412a0`.

API do job114586864267 confirmou a etapa `npm run test:rls` concluída com `success` às22:08:30UTC. A contagem remota aguarda o log final do job. Etapa de navegador em execução e advisors remotos ainda pendentes; não há registro de CI integralmente concluído. Head do PR #15 preservado, ainda em rascunho. Novo read-back local após o alvo27 confirmou zero intenções/recibos de sinal, avisos de pagamento, reservas/recibos de despacho, triggers e sessões auxiliares restantes.

[CI38178835637](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38178835637) concluiu integralmente com sucesso na fonte5d3db8a: 384 testes de banco/23 arquivos, 165 de navegador/sete omissões planejadas e dois advisors sem achados. Logs sanitizados e API confirmaram checkout8d74e4e2f6132189589b192264286b4ef1a2b65a e pais main9a25f31/fonte5d3db8a; head do PR #15 conferido e preservado.

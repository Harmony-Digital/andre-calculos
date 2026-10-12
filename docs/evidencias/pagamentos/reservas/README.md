# Reservas de cobrança fictícias — 2026-10-11

A migration0059 persiste a intenção e sua referência UUID antes de qualquer possibilidade de POST. O contexto vem da obrigação g; o input não aceita conta, cliente, valor, fase, meio ou vencimento livres. O banco compara integralmente a dívida vigente ao contexto capturado, sob locks de perfis, cliente, pedido, pagamentos e configuração. Mudança contratual, proprietário, documento, conta, crédito ou fase exige novo preparo.

Uma reserva por pedido abrange sinal, saldo e trocas de conta. FKs compostas impedem ligar intenção/contexto/pedido ou request/retirada de outra intenção. Intenção, requests, retirada e marco de claim são privados, com RLS, sem privilégios diretos para authenticated/service_role e sem atualização de seus registros. Recibo e auditoria são transacionais.

Replay do UUID original conserva o recibo e não recria uma reserva retirada. Replay de retirada não remove uma reserva posterior. Uma retirada nova exige autorização vigente, revisão correta e ausência de qualquer claim durável; funciona mesmo quando o contexto ficou obsoleto. Claim antigo também bloqueia e não expira para liberar outra cobrança. Isso é retirada de intenção local, sem afirmar cancelamento no Asaas.

Recibos usam `semantics:"receipt_snapshot"`; getters auditados usam `semantics:"current_state"`. O proprietário capturado continua na obrigação imutável e `currentOwnerId` identifica quem possui o cadastro na leitura/operação atual. Os wrappers cruzam ator, UUID, contexto/intenção/pedido e propriedade, usando mensagens fixas sem causa privada. Os DTOs rejeitam payloads com documento, contato ou URL privada.

Esta parte não oferece escritor de despacho nem executa transporte/crédito. Em i, a criação do claim deverá adquirir os mesmos locks e recusar intenção retirada ou sem reserva antes de qualquer POST. A coordenação das reservas com Pix manual e condição contratual pertence à parte m; a projeção comum fica em j.

Os ensaios usam o PostgreSQL dedicado local: positivos/isolamento por papel, concorrência com UUID igual/diferente, replay após retirada/nova reserva, claim persistido, conta/fase/contexto obsoletos, FKs cruzadas e rollback físico da transação com intenção/reserva/request/auditoria ou retirada. Corridas de crédito/proprietário/papel comprovam espera com `pg_blocking_pids`. Fixtures têm setup transacional, snapshots protegidos e limpeza por IDs próprios, restaurando cadastro e configuração.

Comandos: `npm run check`, `bash scripts/dev-env.sh npm run test:rls` e advisors locais de segurança/desempenho no socket Colima andre-calculos. Fonte, contagens finais e resultado de compilação constam do `plan.md`.

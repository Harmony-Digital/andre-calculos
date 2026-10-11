# Operações do pedido

Implementação de M2.19a: calculista inicia análise/cálculo/revisão, devolve para cálculo e registra espera/retorno à etapa interrompida. Cliente acompanha situação e motivos no histórico. A autoria é inferida da sessão; cliente e administrador não comandam etapas. A revisão da entrega continua sendo uma declaração separada, com arquivos obrigatórios.

Migration local: `20261011004600_andre_calculos_0046_order_operations.sql`. `status_revision` avança em qualquer mudança de status; `resume_status` preserva a origem da espera. A RPC grava estado, recibo privado imutável, evento e auditoria na mesma transação. Reenvio anterior não desfaz avanço posterior. Os prazos são preservados enquanto D11 permanece aberta.

```sh
bash scripts/dev-env.sh npm run test:rls -- tests/integration/order-operations.test.ts tests/integration/quote-acceptance.test.ts --testTimeout=30000 --hookTimeout=60000
bash scripts/dev-env.sh npm run test:e2e -- order-operations.spec.ts full-journey.spec.ts --workers=1
```

Executar esses comandos sequencialmente: cada wrapper gera senha efêmera própria para os mesmos usuários fictícios. Execuções simultâneas invalidam as fixtures de login da outra suíte.

Verificações em 2026-10-11:

- 358 testes unitários e doze testes de scripts aprovados; formato, lint e tipos aprovados.
- 36 testes reais de banco dos comandos/aceite aprovados em 21,04 s, incluindo disputa com entrega. Retornos às três etapas, papéis, SQL/máquina, conflito de revisão, replay, payloads inválidos e rollback verificados.
- Advisors locais de segurança/desempenho sem achados. Nenhuma migration aplicada à nuvem.
- Quatro testes de navegador de resposta perdida/conflito aprovados em 375/1440 px. A jornada encontrou motivo ausente na apresentação do histórico; exibição corrigida e repetição em andamento.
- `npm run check` local chegou ao build depois das verificações anteriores; Turbopack foi recusado ao abrir porta interna (`Operation not permitted`). O build ainda precisa da confirmação pelo CI.

Uma primeira suíte completa de banco teve 152 sucessos e oito timeouts no aceite com limite local de cinco segundos sob execução concorrente de build; repetição específica sequencial acima aprovada. Um ensaio concorrente de dois wrappers colidiu as senhas de fixtures e foi descartado. A suíte completa sequencial e a nova jornada serão registradas depois da verificação.

Somente dados fictícios, banco local, capturas PNG sem estado de sessão/trace/HAR. O cálculo técnico e a assinatura ICP-Brasil não são certificados por esta tarefa. O contexto contratual e a confirmação do saldo continuam sendo as duas preparações sintéticas documentadas em `docs/jornada-local.md`.

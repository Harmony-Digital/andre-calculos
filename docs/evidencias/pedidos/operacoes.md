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
- 36 testes reais de banco dos comandos/aceite aprovados em 21,04 s, incluindo disputa com entrega. Suíte completa sequencial: dezessete arquivos e 160 testes aprovados em 51,99 s, com limite local de trinta segundos por teste. Retornos às três etapas, papéis, SQL/máquina, conflito de revisão, replay, payloads inválidos e rollback verificados.
- Advisors locais de segurança/desempenho sem achados. Nenhuma migration aplicada à nuvem.
- Seis testes de navegador aprovados em 1,3 min: resposta perdida/conflito e jornada do cadastro ao download em 375/1440 px. O motivo passou a aparecer no histórico e a nova jornada percorreu os comandos reais, sem preparação sintética da revisão. Axe sem violações nas verificações da jornada; quatorze capturas inspecionadas, sem cortes horizontais ou sobreposição dos controles. Seis capturas representativas preservadas em `capturas/`.
- `npm run check` local chegou ao build depois das verificações anteriores; Turbopack foi recusado ao abrir porta interna (`Operation not permitted`). O mesmo código passou no `npm run check` completo, incluindo build, no CI [38162207294](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38162207294), fonte `45a32d9061f27de278981b120facfc98f3e5d732`. Ambos os jobs concluíram com sucesso: 358 unitários, doze testes de scripts, 160 testes de banco, 117 e2e aprovados/sete omissões restritas a ensaios únicos no projeto celular e advisors locais sem achados. O merge local da main não alterou os bytes de app, migrations ou workflow dessa fonte.

Uma primeira suíte completa de banco teve 152 sucessos e oito timeouts no aceite com limite local de cinco segundos sob execução concorrente de build; repetições específica e completa sequenciais acima aprovadas. Um ensaio concorrente de dois wrappers colidiu as senhas de fixtures e foi descartado. Não houve alteração de asserções nem de timeout no código do CI.

Somente dados fictícios, banco local, capturas PNG sem estado de sessão/trace/HAR. O cálculo técnico e a assinatura ICP-Brasil não são certificados por esta tarefa. O contexto contratual e a confirmação do saldo continuam sendo as duas preparações sintéticas documentadas em `docs/jornada-local.md`.

Repetição completa do head do PR #3 no CI [38163315728](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38163315728): ambos os jobs concluídos com sucesso em 2026-10-11, 117 e2e/sete omissões e advisors sem achados. Nenhuma publicação da nova fonte nesta execução.

# Run e autorização consumível da emissão fictícia

A migration0063 cria run único por intenção e etapas privadas com token, revisão e start consumível. A autoridade é a solicitação reserve autenticada e imutável de0059, vinculada a ator, intenção, contexto, referência e obrigação. Metadata ausente é recusada. O worker de sistema tem locks próprios e não fabrica sessão humana.

Alocar uma etapa não autoriza emissão. O primeiro startcreate revalida proprietário/papel, dívida, binding, conta, reserva e retirada sob locks comuns. Na mesma transação, grava o claim permanente com run_id da execução, consome o start e audita como sistema. Uma etapa antiga, token incorreto ou replay de start não recebem nova autorização. Depois do claim ou de payment_create anterior no journalN, a retomada aloca somente consulta.

Runs e snapshots são imutáveis em identidade; claims não expiram nem são removidos. O vínculo da etapa ao próprio run é uma FK composta. Mudanças anteriores ao claim bloqueiam; depois dele, consultas usam conta/cliente/contexto capturados. Retirada e start disputam a mesma reserva sob locks. O getter humano autoriza proprietário/papel atuais e audita, retornando somente estado/IDs, sem documento, recibo, URL ou snapshot.

A API de sistema é somente servidor, com opt-in, loopback exato e bloqueio de Vercel/produção antes de criar o cliente privilegiado. O descritor privado confere a solicitação inclusive sem etapa e rejeita create com claim existente ou etapa sem reserva ativa. Nenhum transporte é executado nesta parte; R/S completam emissão, observação, resolução e jornada deP/I.

Ensaios próprios:29 unitários de guardas, coerência, identidade, DTO e erros fixos;20 integrações reais que partem sem binding do cliente, percorremO→G→L→run/start, disputam workers e retirada/start, preservam recibo histórico, bloqueiam contexto/papel/dívida alterados e reconstituem o start após rollback. Claim existente conserva run_id e só permite consulta. Marker desligado e papéis de sistema/públicos são conferidos.

Comandos: npm run check; bash scripts/dev-env.sh npm run test:rls; advisors locais de segurança/desempenho. Resultados gerais e fonte final ficam registrados no plan.md. Nenhuma migration na nuvem, HTTP ao Asaas, cobrança/crédito ou publicação real.

Suíte geral local aprovada:517 banco/29 arquivos,1059 unitários/56 arquivos e43 scripts. Advisors de segurança/desempenho sem achados; duas revisões sem bloqueador. Read-back63 migrations/25 tabelas públicas/42 privadas, quatro perfis, markerfalse e zero execuções/etapas/customerWork/fatos/recibos/intenções/claims/reservas/scopes/bindings/contextos. Check local chega ao build e encontra a restrição conhecida de porta interna do Turbopack; extrato SHA-256c77bb600a9f3f0caec69151e43f0050fd54835707bac208175bd0ca5ed1745d9. Compilação da fonte final será conferida no CI.

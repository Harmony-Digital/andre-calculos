# Ensaio local de recusa — M2.12a

O cliente proprietário confirma explicitamente a recusa antes da contratação. A transação conserva a proposta, o PDF, os contextos, os arquivos, os valores e a condição de contrato; muda `quoted` para `cancelled`, incrementa a revisão e grava recibo privado, evento e auditoria. O painel consulta a decisão.

A elegibilidade exige contexto comercial íntegro, ausência de ambiguidade e nenhum aceite ou pagamento vinculado, incluindo triagem e parcelas pendentes/confirmadas/estornadas. Validade encerrada e versões jurídicas atuais diferentes permitem recusa. Aceite e recusa disputam os mesmos locks; novo aceite continua bloqueado mesmo se `quoted` for restaurado no ensaio administrativo.

A intenção conserva UUID, revisão, motivo e confirmação após perda de resposta. O replay recupera o registro original sem nova mudança de estado. Consulta temporariamente indisponível admite reenvio; ausência confirmada ou PT409 exigem recarga completa.

Validação em 2026-10-11:

- Migration 0051 aplicada somente no PostgreSQL local; 33 regressões próprias e 315 testes reais de banco em vinte arquivos aprovados (90,81 s).
- Disputa dirigida aceitar/recusar nas duas ordens e INSERT de pagamento concorrente observados por `pg_blocking_pids`; reconferência depois do lock. Rollback de auditoria/evento, replay, UUID divergente, revisões obsoletas, legado e nove combinações de pagamentos verificados.
- 379 unitários em 37 arquivos, formato/lint/tipos e doze testes de scripts aprovados. Build local encontra a restrição de porta interna do Turbopack; validação da nova fonte no CI ainda necessária.
- Doze regressões de aceite/jornada aprovadas em 375/1440 px; quatro e2e próprios finais aprovados em 16,7 s. Texto do PDF idêntico antes/depois (`pdftotext`), acesso do calculista permitido, outro cliente/admin bloqueados, recuperação da resposta perdida e conflito definitivo conferidos.
- Axe A/AA sem violações nas telas próprias e largura sem transbordamento. Quatro capturas finais inspecionadas visualmente: formulário e recibo em computador/celular, sem sobreposições. Capturas após retorno ao topo preservam o link de acessibilidade fora da imagem.
- Advisors locais de segurança e desempenho sem achados. Lint não aponta problema na 0051; registra somente avisos anteriores de variáveis de loop redundantes em validadores CPF/CNPJ da 0049.

```sh
bash scripts/dev-env.sh npm run test:rls -- --testTimeout=30000 --hookTimeout=60000
bash scripts/dev-env.sh npm run test:e2e -- quote-rejection.spec.ts quote-acceptance.spec.ts full-journey.spec.ts --workers=1
bash scripts/dev-env.sh npm run test:e2e -- quote-rejection.spec.ts --workers=1
```

Contextos positivos são sintéticos e exclusivos do ensaio. Não foi criado produtor comercial, aviso novo, cobrança, estorno ou reabertura de pedido. Nenhuma migration, configuração Auth, segredo ou publicação na nuvem nesta entrega. A FK serializa INSERT concorrente; ela não impede uma escrita administrativa futura, que deve reconferir as regras pelos produtores autorizados.

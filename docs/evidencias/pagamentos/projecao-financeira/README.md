# Evidências de M3.01w — posição e projeção financeira

Recorte: desenvolvimento local com dados fictícios, autorizado pelo Fábio na fonte b9b687d. O motor e as consultas não acionam Asaas, envio externo, fila, download ou liberação de reserva. O escritor transacional pertence a M3.01x e a integração dos consumidores a M3.01v. Situação e próximas tarefas ficam exclusivamente em `plan.md`.

## Crédito cumulativo

O motor usa a identidade e os fatos duráveis de T. Não transforma eventos em deltas: crédito é bruto RECEIVED comprovado, menos refunds DONE e débito efetivado de chargeback, descontadas apenas suas reversões comprovadas. Taxa fica separada. Valores, restante e excesso usam inteiros seguros e BigInt; ausência não vira zero disponível. Disputa, refund pendente, ordem desconhecida, prova incompleta ou regressão conservam conciliação.

Quando o valor corrente já reflete devolução, só a igualdade exata `corrente + DONE = bruto anteriormente comprovado` permite reutilizar esse bruto. A comparação mantém o histórico e a multiplicidade dos refunds, sem inferir pagamento pelo status de estorno nem ignorar limites ou chargebacks excedentes. Replay valida todo o histórico antes de confirmar certeza. Fonte antiga conserva a posição; conflito durável conserva o valor observado, retira o candidato de resolução e impede certeza.

## Cobertura e origem

As migrations 0074–0077 preparam posições privadas e vínculos explícitos de legado, com RLS e sem grants diretos da aplicação. A guarda confere origem imutável T, revisão, composição numérica, restante/excesso, prova de débito e candidato terminal. Somente fixtures explícitas dos testes gravam posições nesta parte; nenhum caso de aplicação comercial foi exposto.

O fingerprint representa o conjunto distinto de fatos/prova/ordem de T. Ordenação de arrays conserva multiplicidade; timestamps e UUIDs não escolhem verdade financeira. Observações sem fatos conservam seu ID para não equivaler a replay financeiro. Consulta aberta, conjunto não considerado ou qualquer conflito durável tornam o crédito disponível desconhecido; o subtotal observado continua separado. Não há backfill automático para posições antigas.

A guarda impede carimbar cobertura conhecida quando a última consulta está aberta, falhou, diverge da base ou há conflito. Um `same` antigo não pode encobrir UNKNOWN posterior. Uma consulta atual equivalente pode confirmar a cobertura após rederivação válida. O leitor de sistema devolve revisão da posição, revisão da cobrança e fingerprint; `canConfirmKnownCoverage` é apenas metadado para X, que deve reler e comparar os três sob locks antes de qualquer commit. A guarda não substitui esse protocolo. A leitura do sistema e sua validação de escopo usam STABLE para obter revisões, histórico e fingerprint no mesmo snapshot da query. Essa propriedade segue a [documentação do PostgreSQL 17](https://www.postgresql.org/docs/17/xfunc-volatility.html); o futuro escritor continua transacional e VOLATILE.

## Composição e autorização

A projeção comum soma cada pagamento Pix manual confirmado uma vez, com ou sem recibo. Soma cada posição da cobrança do provedor uma vez e discrimina sinal/saldo. Legado Asaas sem origem inequívoca impede certeza; um vínculo explícito da fixture impede contar linha antiga e posição novamente. `provider_ref` isolado nunca prova conta, intenção ou fase.

A leitura autoriza o dono atual ou calculista e audita o pedido; outro cliente, administrador e chamadas diretas de sistema não ganham essa leitura. A derivação fictícia recebe somente o ID da observação, exige ambiente local e recupera expectativa, fatos, posição e histórico no servidor. DTOs são estritos e erros públicos não carregam body, conta ou URL de fatura.

## Verificação

Os comandos, contagens finais, hashes e fonte do CI são registrados após sua execução em `plan.md`. Os ensaios cobrem motor em centavos, taxa desconhecida, parcial/excesso, devolução ajustada, chargeback/reversão/regressão, histórico tardio, replay, UNKNOWN e consulta superseded; composição manual/legado, fase, excesso numérico, autorização, RLS, cobertura e guardas privadas. Revisões independentes são somente por leitura; não substituem os testes.

- `npm --prefix app run check`: formato/lint/tipos, 1189 unitários/60 arquivos e43 scripts passaram. Build local conserva o bloqueio de porta Turbopack/CSS do react-pdf; check/build da fonte final será confirmado no CI e registrado em `plan.md`. Log SHA-256 `d6ca8b4a573a863b46851523240629e339813b17da646d2e7664f216ebf58c69`.
- Regressão local até 0076:653 banco/33 arquivos aprovados. Log `3262a684e40afab4e962330507d7a74b6dfb6dd43f328d70fe7b99e2847f377a`. Após 0077,63 focados/2 arquivos passaram:33 próprios de W e30 regressões de T, incluindo seus fluxos compartilhados de transporte/autoridade. Log `546de18d3d55057d7740e0f2dc5fa4c67fd6651de9076016403d8b564966c78b`.
- Concorrência real entre dois processos: o teste falhou antes de 0077 (revisão2 em leitura iniciada na revisão1) e passou após STABLE. Log da reprodução `e41cb33081651421067d925846134fc0de41d0df79a8f7f84b5012c65279ea9c`.
- Advisors após cada migration e no fim:sem achados de segurança/desempenho. Log final `97540f3494191882bfdb34e0ce0f4c388fadcbcc74d8eb41200ead6110c07daa`. Duas revisões independentes por leitura sem bloqueadores restantes; os revisores não executaram os ensaios.
- Read-back:77 migrations,25 tabelas públicas/51 privadas, todas com RLS;4 perfis fictícios e marker false. Posições, vínculos, journals e demais metadados de pagamentos do ensaio estão vazios. Permanece a linha fictícia de pagamento prevista no seed, sem remoção de dados preexistentes. Log `afa31d9f7dc7a5defc25c25031f0ad6abcb59207a14705868e75b7dbedfd0e0d`.

O check/build da fonte `303b47757364d2d98f441324547672d4d7115ca8` foi confirmado no CI38205949733/job114669363566:1189 unitários/60 arquivos,43 scripts e sete páginas estáticas. Checkout `a1a7589ccebbe9a89500e0ddf25f841a9fe989fc`, pais main9a25+fonte e head do PR #28 conferidos. Extrato sanitizado SHA-256 `388b55e78fbeebd6667b83cd89c99fa640c63a93887c109ff2cbad0912f15493`. O estado da suíte geral e da entrega ficam em `plan.md`; o head remoto permanece preservado.

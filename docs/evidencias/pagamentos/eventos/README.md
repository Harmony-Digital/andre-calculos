# Observações financeiras do Asaas — 2026-10-11

M3.01f prepara fatos financeiros somente servidor a partir de evento ou consulta textual. Cada leitura confere conta/ambiente, cliente, cobrança, referência da obrigação, valor original e vencimento esperado. O método solicitado e o observado ficam separados: alteração, escolha autorizada em `UNDEFINED` ou baixa externa não altera silenciosamente a identidade da obrigação. A referência do provedor não é interpretada como ID do pedido.

`effects:"none"`, `identityProof:"declared_unverified"` e `semantics:"cumulative_snapshot"` estão explícitos. A saída não confirma pagamento local, aplica crédito, chama RPC, entra na fila, libera documento ou executa transporte. Documento, contato, URL da fatura, comprovante e cartão não entram na projeção.

## Interpretação e valores

A whitelist de interpretação é política local, sem pretender ser enumeração exaustiva do provedor. Pares centrais conhecidos distinguem obrigação, autorização, confirmação indisponível, recebimento, estorno, contestação e eventos sem novo recebimento. Tags futuras e combinações incompatíveis conservam os fatos e exigem conciliação. O status não é fabricado retirando o prefixo do evento. Atualização, visualização ou restauração não se tornam recebimento apenas pelo nome. [Eventos](https://docs.asaas.com/docs/webhook-para-cobrancas).

Pix `CONFIRMED` continua cautelar, sem antecipar `RECEIVED`. `RECEIVED_IN_CASH` representa baixa externa/manual, não recebimento financeiro automático do portal. Estorno negado é interpretado somente em boleto. [Pix](https://docs.asaas.com/reference/criar-nova-cobranca), [baixa manual](https://docs.asaas.com/reference/confirmar-recebimento-em-dinheiro), [eventos](https://docs.asaas.com/docs/webhook-para-cobrancas).

A decodificação conserva presença `missing`, `null`, `empty` ou `present` antes de projetar valores. Ausência de líquido não vira taxa zero; ausência/null de estornos não vira total devolvido zero. Array vazio registra a coleção vazia daquele snapshot, sem provar completude/autenticação do emissor. Líquido fora de zero até bruto, valores acima do contrato, insuficiência ou contradição exigem conciliação.

Contrato, valor atual, original informado, líquido e diferença de taxa são fatos separados em centavos. Recebimento inferior ao contrato com original coerente é preservado, sem inventar parcelamento; excedente não é truncado. A diferença bruto/líquido usa BigInt e nunca reduz o pagamento do advogado. O campo `grossLessCompletedRefundsCents` é apenas aritmética do bruto observado menos DONE coerente, sem qualificação de saldo/credito elegível. Pode permanecer nulo em casos incompletos/incompatíveis; nunca é autorização para aplicar efeito. [Original e fatos](https://docs.asaas.com/docs/webhook-para-cobrancas).

Todos os itens de estorno são mantidos, inclusive dois com valor/data iguais. DONE, PENDING, CANCELLED e tags desconhecidas têm agregados distintos por BigInt. Somente DONE é devolução concluída; cancelamentos não reduzem o bruto. Soma acima do limite seguro ou do bruto pede conciliação sem arredondar, limitar ou remover itens. Estorno total/pendente exige montante suficiente também em consulta ou evento de visualização, conforme estado recebido. Parcial não é representado pelo status integral do domínio. [Estornos](https://docs.asaas.com/docs/estornos).

Chargeback conserva status, com montante desconhecido. DONE nessa contestação não equivale a refund DONE; REVERSED não restaura valor automaticamente. Objeto ausente/estado não suportado/evento incompatível continuam inconclusivos. [Chargeback](https://docs.asaas.com/docs/chargeback).

## Comparação cumulativa

Dois eventos brutos são lidos contra um único contexto/escopo capturado e congelado. A igualdade inclui presença, multiplicidade dos estornos, classificação e recebimento observado, evitando confundir visualização com recebimento. Reordenação do JSON/itens não soma novamente. Replay significa igualdade da projeção usada, não prova de igualdade byte a byte do payload nem deduplicação persistida.

Outro ID com os mesmos fatos conserva a mesma visão cumulativa. Mesmo ID com fatos/tipo/horário diferentes é conflito. Evento declarado anterior, empate temporal com mudança, DONE reduzido/desaparecido, bruto/estado regredido ou chargeback desaparecido exigem conferência. `CONFIRMED` pode permanecer `CONFIRMED`; voltar de `RECEIVED` para `CONFIRMED` é regressão.

A comparação não elege vencedor, gera delta aplicável ou soma snapshots. Um horário posterior é somente declaração temporal em texto/segundos, sem fuso inventado ou sequência causal garantida; mudanças são candidatas que requerem consulta autoritativa em M3.01b/c. Persistência, autenticação, watermark, reentrega e efeitos ainda pertencem às próximas partes. [Idempotência](https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks), [entrega e ordem](https://docs.asaas.com/docs/tipos-de-envio).

## Verificação executada

146 testes próprios aprovados; `npm run check` aprovou formato, lint, tipos,878 unitários/50 arquivos e43 scripts. Os novos casos cobrem recebimento parcial/excedente, métodos/manual/Pix, presença dos campos, taxas, estornos mistos/iguais, totais seguros/overflow, status/valores insuficientes, chargeback, replay/conflito, igualdade semântica, ordem e regressão; duas revisões independentes confirmaram as correções e não encontraram bloqueador no fechamento.

O check detectou uma sobrescrita acidental da suíte durante edição, antes do commit. O root recuperou a chamada original da própria sessão e preservou todos os casos antigos/novos; a suíte final e o check acima foram executados após a restauração e correções. O build local encontrou o EPERM conhecido da porta interna do Turbopack em CSS do PDF, sem alteração do runtime ou desvio da verificação. O resultado remoto da fonte está registrado abaixo.

Não houve driver/credencial/Asaas autenticado, banco financeiro, mudança de histórico, crédito, pagamento, envio real ou publicação. Pareamentos conservadores de estorno e compatibilidade dos campos/URLs/timestamps exigem ensaio real de M3.01c; mocks não o substituem. M3.01a fecha apenas o preparo local após verificação da fonte, e M3.01 permanece dependente de persistência/ensaio.

O mesmo código passou no `npm run check`/build remoto do [CI38183836577](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38183836577), qualidade114601844053, fonte `3dabd4dd888749f2dd0398fc2af0e85d5266083f` do [PR #18](https://github.com/Harmony-Digital/andre-calculos/pull/18): 878 unitários/50 arquivos,43 scripts e compilação/geração de páginas. Checkout `52650030f80793a5a4291af4504a3c5577dab10d` e pais main `9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd` + fonte3dabd4d conferidos pela API. Extrato sanitizado de validação SHA-256 `3ffe25ab2a8944fd2b72987cf35d17e80572f9fb9ee1dea417674411b336ba7d`. CI integral encerrado com sucesso:384 testes de banco em23 arquivos,165 de navegador e sete omissões planejadas; advisors de segurança/desempenho sem achados. Checkout/pais e fonte acima conferidos. Extrato sanitizado e2e SHA-256 `0410e60d9a84cf78aa5e8a9b0bfdac1cfa41742c0bc9209d9118030b62b1b528`. PR #18 pronto para revisão, fonte preservada.

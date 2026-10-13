# Percursos nominais do webhook nas telas

Evidências de M3.01c3c3b. O andamento canônico permanece no `plan.md`.

Seis percursos completos usam Pix, boleto e cartão em 375/1440 px, com sessões independentes de advogado e calculista. O aceite e o contexto inicial são fictícios declarados pelo helper. O receptor e o worker existentes confirmam sinal de 12.501 e saldo de 12.500 centavos no mesmo pedido, total de 25.001, sem pagamento público ou ledger adicional.

Cada percurso confere a fatura pendente, recebimento e linha do tempo, upload TUS de PDF com SHA, entrada única na fila, etapas de análise/cálculo/revisão, upload de PDF/PJC/parecer e confirmação de entrega pelos comandos da interface. A aprovação `after_balance` vale somente para essa entrega fictícia. O cliente recebe 404 antes da revisão, antes da regra e antes do saldo; depois recebe os três arquivos corretos, com auditoria individual, link de até 120 segundos e cache `no-store`. Outro cliente continua sem acesso. Preparar saldo novamente e reenviar o evento não cria nova cobrança, crédito ou aviso.

O primeiro filtro de nome não encontrou testes e terminou com exit1; foi corrigida somente a expressão de seleção. O primeiro Pix/computador passou em 18,5 s. Os primeiros seis percursos passaram em 1,3 min e produziram 60 capturas, inspecionadas visualmente sem cortes ou sobreposições. Após ampliar a prova para todos os arquivos e repetição do preparo de saldo, os seis percursos finais passaram em 1,4 min, sem retries, com 60 capturas e 18 downloads auditados. Axe WCAG A/AA e largura foram conferidos em cada captura. `downloads.json` contém somente nomes, hashes e tamanhos fictícios; nenhum token ou URL assinada foi arquivado.

Read-back, controles e grants finais são idênticos ao baseline: 106 migrations, 25 tabelas públicas e 61 privadas com RLS, quatro perfis, fixture desativada e pagamento manual original pendente de 12.500 centavos. Ambos os advisors retornaram `No issues found`. Os contextos, runner, arquivos e fixtures foram encerrados e limpos.

Formato, lint, tipos, 1.494 testes unitários em 75 arquivos e 43 testes de scripts passaram. O build local encontrou a restrição EPERM da porta interna do Turbopack; a prova do check/build da fonte exata deve vir do CI. Produto, SQL, scripts e workflow não foram alterados. Estados financeiros adversos, consolidação visual final e ensaio externo permanecem nos recortes próprios c/d/C4. Nenhum pagamento, assinatura ou publicação real foi realizado.

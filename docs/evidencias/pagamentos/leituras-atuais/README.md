# Leituras financeiras atuais — ensaios fictícios locais

Sinal, fila do André e instruções de saldo leem a mesma projeção atual W. Os DTOs de apresentação são separados dos contextos/recibos históricos, que conservam valor, autoria e data. Valores disponíveis desconhecidos ficam nulos; subtotal observado é identificado como pendente de conciliação. Crédito excedente não é limitado artificialmente. A reserva por pedido bloqueia novas instruções mesmo antes de charge, em outro scope ou na finalidade saldo. Um claim histórico resolvido não equivale a reserva vigente.

## Banco e autorização

SQL0089 foi aplicado somente no banco local. Builders STABLE compartilham snapshot de autorização, contrato vigente, W e reserva; o lote aceita no máximo50 pedidos e rejeita integralmente IDs ausentes, duplicados ou não autorizados. O wrapper público registra auditoria do leitor. Helpers privados não têm grants de aplicação; RPCs públicos são restritos a authenticated. O leitor TABLE anterior mantém suas quatro colunas e representa saldo desconhecido como null.

Os testes usam produtores reais locais da fixture financeira para T/Y/origem/vínculo/terminal. A apresentação é comparada aW em parcial/excesso, taxa, refund parcial/integral/pendente, UNKNOWN, legado sem origem e reserva sem charge. Manual comprovado é contado uma vez e seu recibo permanece íntegro após estorno. A conferência zero sob reserva não cria pagamento nem remove proteção. Contrato vigente dispensa sinal sem quitar ou reduzir o saldo. O cenário final de saldo misto combina crédito do provedor e manual elegíveis; triagem e pagamento pendente não entram, quitação remove instrução e estorno recompõe o restante.

Fixtures sem aceite/contexto comercial nos ensaios antigos de fila/entrega permanecem em conciliação. As expectativas financeiras foram corrigidas sem inventar aceite nem atribuir origem; autorização e verificações anteriores de arquivos são preservadas. Os novos positivos com aceite/origem estão nos ensaios current-credit-readers e current-credit.

## Navegador

Seis casos próprios em375/1440px exercitam recebimento, estorno, sinal/fila parcial, conciliação/subtotal, saldo corrente e conciliação do saldo; parcial/excesso bloqueiam Pix e confirmação manual positiva. A fila permanece em trabalho após movimento financeiro. O upload do documento do processo usa a interface e a política after_balance é aprovada individualmente pela interface fictícia. Apenas o estado/metadata técnicos da entrega são pré-condição sintética; este ensaio não afirma assinatura válida nem download financeiro. Foram preservadas24 capturas, inspecionadas; Axe e largura passaram em todas.

## Limites

Contrato/upload como escritores ficam emAG; autorização de links/URLs/bytes e ambas as políticas pela projeção ficam emAH; jornada integral dos consumidores fica emAI. AF não fechaV/J nem substitui a confirmação do saldo deM3.09. Asaas real, webhook, banco cloud, publicação, produção e despacho a pessoas reais não são ativados. D5/D6 permanecem decisões humanas abertas.

## Resultados registrados

SQL0089 local e advisors após a migration sem achados. Nove unitários próprios/1293 gerais em63 arquivos e43 testes de scripts aprovados. Suíte geral local:814 banco em39 arquivos, incluindo16 próprios dos novos leitores. Foco préfinal:31 banco emtrês arquivos;14 navegador em375/1440 comAxe e24 capturas próprias inspecionadas.

Format/lint/tipos/testes/scripts passaram no npm run check. O build local conserva a restrição EPERM de abertura de porta do Turbopack; check/build da fonte b77a8c880e4a9ff1a8e74f5669c53b7b146301bc foi aprovado noCI38248514809/job114808421161, com1293 unitários/63 arquivos,43 scripts e sete páginas. Dez regressões de navegador de entrega/jornada passaram em375/1440px. Read-back final:89 migrations,25 tabelas públicas/55 privadas comRLS,4 perfis,markerfalse e todos os metadados financeiros do ensaio vazios;somente payment_fixture_environment mantém sua linha de configuração desativada. Seed econtroles ficaram idênticos ao último read-back verificado da jornada AE. Advisors finais sem achados. Checkout e9d9a21f688186ef9c29c2fe8f7ab18c521d8fca,pais main9a25+fonte/head e extrato original02bbe85f36baf274331dc026e8a4eeccf373d28ad807a305c040fe7ba19ca4d7 conferidos. A suíte geral remota dessa fonte permanece em execução; sua conclusão não foi afirmada.

# Regra pura da liberação pelo crédito atual

O contexto current_delivery_access reúne entrega, pedido, processo, status, política capturada e current_order_credit. O parser normaliza UUIDs e exige exatamente as entregas pedidas, até cinquenta. Entregas do mesmo pedido podem conservar políticas distintas, mas não podem receber status ou créditos contraditórios no mesmo lote. Recibos históricos, efeitos, IDs trocados e valores incoerentes são recusados.

A regra exige revisão e política, valores aceitos seguros e certeza da fase aplicável. Antes do saldo, contrato vigente dispensa o sinal; caso contrário, o sinal conhecido precisa cobrir o exigido. Incerteza restrita ao saldo não apaga a certeza do sinal. Depois do saldo, o crédito total precisa estar conhecido e cobrir o valor aceito, inclusive para quem tem contrato. Excesso comprovado é conservado, e reserva ativa não apaga crédito conhecido. A função não cobra, devolve, audita nem modifica entrega ou aprovação técnica. Estorno, incerteza e restauração mudam a elegibilidade derivada.

Quarenta e nove testes novos e doze regressões passaram no foco; o check aprovou formato/lint/tipos, 1.370 unitários em 66 arquivos e 43 testes de scripts. A cobertura V8 desta regra tem 46/46 instruções, 48/48 ramos e 9/9 funções executadas. O build local terminou com EPERM do Turbopack ao vincular porta; o check/build da fonte exata ainda depende do CI.

O módulo foi preparado separado dos consumidores existentes. Não comprova autorização de RLS, locks, conteúdo, URL assinada ou auditoria; SQL/rotas/telas continuam com a implementação anterior até a integração coerente prevista em AN/AO. Nenhuma migration, liberação real de arquivo ou escolha comercial de D6 foi executada por este preparo.

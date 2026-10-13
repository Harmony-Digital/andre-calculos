# Evidência da consulta de fatura do saldo — M3.01au

O caso de uso servidor recebe fase explícita, preservando deposit como padrão. A apresentação valida a fase esperada e recusa uma fatura de saldo onde foi pedido sinal. Contrato que dispensa sinal não dispensa o saldo; proposta gratuita informa ausência de dívida sem declarar recebimento.

Migrations97/98 exclusivamente locais. A query privada registra phase, com guarda de identidade/fase imutável e correspondência à origem financeira. Preparação do saldo fixa balance no servidor; leitura/conclusão reconferem dono, papel, conta, entrega, fontes financeiras, reserva, expectativa, prazo da consulta e resposta atual. URL entra apenas no retorno validado em memória, depois da auditoria; nada é emitido, creditado ou liberado pela consulta.

Uma fatura PENDING própria admite leitura somente com as demais posições atuais e certas, sem conflito/legado não vinculado, e subtotal líquido igual ao capturado na emissão. Valor da fatura e restante desconhecido continuam separados. O teste de reemissão após estorno encontrou contagem indevida das cobranças históricas;98 seleciona a origem da reserva vigente e conserva todo o histórico na projeção.97 aplicada foi preservada.

82 testes de banco em quatro arquivos passaram em162,94s:25 próprios da consulta,26 do sinal,16 do produtor do saldo e15 jornadas financeiras. Incluem Pix/boleto/cartão/escolha de meio,cliente/calculista e papéis indevidos,isolamento/fase,consulta simultânea,perda-reenvio,404,recebimento/parcial/estorno/status desconhecido,expiração,entrega retirada,crédito alterado/fonte ainda não aplicada,papel/conta revogados,rollback de auditoria,contrato/proposta gratuita e nova cobrança após estorno. Quatro testes unitários novos e37 focados passaram;1436 gerais/72arquivos e43scripts/formato/lint/tipos aprovados.

Read-back:98 migrations,25 públicas/56 privadas com RLS,quatro perfis e pagamento original preservado;demais linhas do baseline anteriores idênticas. Controles idênticos,zero queries/auditorias/grants indevidos/objetos temporários. Funções privadas sem execute público/anon/authenticated/service_role;preparação de saldo apenas authenticated. Dois advisors sem achados após cada migration e ao final. Manifesto preserva hashes de fontes,logs originais e extratos. Build local encontrou EPERM de criação de processo/porta do Turbopack;verificação remota da fonte exata ainda necessária.

A entrada nas áreas privadas e as jornadas de navegador da fatura de saldo pertencem aAV. Nenhuma migration remota,driver,webhook,cobrança ou publicação reais.

# Sinal por Pix manual

O resumo da pasta reúne, por pedido aceito, o sinal contratado, os depósitos
atualmente confirmados e o restante. O cliente recebe a chave Pix e o código
do pedido somente dentro de seu processo. Se a chave estiver ausente, pede os
dados pela conversa. André confere a transferência fora do sistema e registra
o recebimento pelo botão do painel; o navegador não informa valor livre nem
identidade do responsável.

A RPC `confirm_manual_deposit` deriva o valor do contexto imutável da proposta
aceita. Apenas parcelas `deposit` em `confirmed` reduzem o sinal. Saldo,
triagem, pendências e estornos não contam. Um sinal positivo já integralmente
registrado pode ser conferido sem criar outro lançamento ou pagamento de zero.
O recibo distingue o crédito anterior do novo valor recebido. Proposta com sinal
zero exige conferência comercial; este fluxo não determina gratuidade.

Perfil, cliente, pedido e todos os pagamentos são trancados antes da soma. O
recibo e o UUID da tentativa ficam em tabelas privadas com RLS e sem escrita
direta da aplicação. Resposta perdida recupera o resultado original; duas
confirmações não criam dois depósitos. Alterar o conteúdo de uma tentativa
usando o mesmo UUID é recusado. Nova intenção após estorno recalcula o restante
e exige pedido ainda apto a receber o sinal.

Valor, vínculo, método, responsável e instante de pagamentos canônicos não
podem ser reescritos. O modelo existente representa devolução integral por
`refunded`: o recibo histórico permanece, o crédito atual diminui e reenvio do
UUID original não reconfirma o pagamento. Não há comando de estorno ou política
de reabertura nesta etapa; essas decisões permanecem em D5.

A fila exige aceite válido, sinal suficiente **ou contrato atual**, além de
documento `case/client` confirmado, com tamanho positivo e hash conferido.
Pagamento anterior ao documento aguarda o envio. Documento anterior ao
pagamento entra na fila na confirmação do sinal. O primeiro upload posterior
usa a mesma guarda. Um contrato antigo registrado no recibo de aceite não
substitui a condição atual do cliente.

Pagamento, recibos, estado, eventos, auditoria e eventual aviso de fila fazem
parte da mesma transação. O aviso inclui código, data de entrega, prazo interno
e link do painel; só é enfileirado quando o pedido entra na fila e respeita as
preferências existentes. Uma falha no aviso reverte a operação inteira.

Os ensaios positivos usam contextos, identidades e dados fictícios no Supabase
local exclusivo. As migrations preservam o bloqueio comercial do emissor e das
simulações. Dados profissionais, chave Pix e condições reais precisam ser
confirmados para ativação, junto do produtor comercial e dos textos legais
aprovados. Nenhum provedor recebe instrução de cobrança ou mensagem nesses
ensaios.

# Evidência de cobrança por fase

A prova conserva os seis requisitos originais de M3.01b. A suíte geral da fonte `0bdb403a2a2ea842bb20ae840d03194983eef51e` executou 932 testes em 47 arquivos e terminou com sucesso. Depois dela, os quatro casos de `payment-phase-journey.test.ts` passaram separadamente; eles não estavam na suíte geral anterior. Nenhum arquivo de produto, SQL ou helper anterior mudou nesta consolidação.

| Requisito original | Evidência executada |
|---|---|
| Intenção e identidade antes da API; concorrência | `payment-intents`, `payment-execution-start`, `customer-bootstrap`; suíte geral |
| Sinal e saldo líquidos por fase, contrato e taxa | `payment-obligations`, `balance-journey`; três casos adicionais de contrato e um de chargeback no saldo |
| Retomada após resposta perdida | `payment-execution-transport`, `payment-execution-resolution`, `balance-journey`; suíte geral |
| Reconciliação e reserva exclusiva antes de nova emissão | `payment-reservation-coordination`, `financial-creation-guards`, `financial-execution-resolution`; suíte geral |
| Histórico imutável e projeção comum | `payment-financial-observations`, `financial-application`, `financial-projection`, `financial-journey`; caso adicional de chargeback no saldo |
| Fatura do proprietário e acesso negado entre clientes | `invoice-query`, `balance-invoice-query`; navegador documentado em `../saldo/interface/` e `../interface/` |

Os casos adicionais usam somente o provedor fictício declarado. O cliente com contrato retira uma reserva de sinal ainda não despachada pela RPC, recebe a condição contratual pela RPC, não pode emitir saldo antes da entrega técnica fictícia e depois emite o total de 25.001 centavos por Pix, boleto e cartão. Não há sinal ou pagamento confirmado inventado para compor essa dívida.

O caso de chargeback recebe sinal e saldo pelos produtores existentes, aplica disputa, débito e reversões cumulativas. Conserva os 12.501 centavos do sinal, as linhas originais de pagamentos e a quantidade de confirmações na linha do tempo. A taxa de 100 centavos permanece separada; um único POST de saldo é mantido. A fatura fica incerta durante a disputa.

Após ambos os ensaios, o read-back e os controles financeiros são idênticos aos baselines: 98 migrations, 25 tabelas públicas, 56 privadas com RLS e quatro perfis fictícios. Os advisors de segurança e desempenho não encontraram problemas. `cobertura-requisitos.json` registra fontes e hashes.

Esta evidência não prova transporte Asaas real, webhook externo, ativação comercial nem aprovação das decisões D5/D6. Essas condições continuam em M3.01c e M3.09.

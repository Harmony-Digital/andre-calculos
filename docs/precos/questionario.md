# Tabela de preços — definições do André

Preencher antes de ativar uma tabela ou emitir propostas. Valores de referência de pesquisa são apenas exemplos e nunca substituem esta definição.

| Configuração | Resposta |
|---|---|
| Inicial, liquidação, impugnação e atualização: preço base de cada serviço | Pendente |
| Verbas incluídas no base e valor por verba adicional | Pendente |
| Meses incluídos no base e valor por mês contratual adicional | Pendente |
| Digitação de cartões: cobrar por mês ou página? Valor por unidade? | Pendente |
| Preço por reclamante extra | Pendente |
| Urgência: percentual e critérios de aceite | Pendente |
| Prazo útil para pedidos simples, médios e de alta complexidade | Pendente |
| Folga de entrega antes do vencimento processual | Pendente |
| Validade da proposta | Pendente |
| Taxa de triagem e regra de abatimento | Pendente (D5) |

O motor guarda a versão da tabela, discrimina base e adicionais e calcula o sinal de 50% com arredondamento para cima. Os preços são centavos inteiros; a urgência usa pontos-base. Valores zero significam um adicional gratuito explicitamente configurado, não preço desconhecido. Tabela incompleta é recusada.

O arquivo `app/src/modules/quotes/example-table.ts` contém somente o exemplo `isExample: true` previsto em M2.07. Ele não é usado nas telas públicas nem permite contratar um serviço.

# Questionário de preços, prazos e condições

Responsável pelas respostas: André. Data: __________.

Preencha valores em reais e prazos em dias úteis. O sistema armazenará dinheiro em centavos. Para cada adicional, indique unidade, condição de aplicação e possibilidade de acumular com outros. Nenhum valor de exemplo será ativado como preço real sem sua decisão.

1. Confirme nome, categoria e CRC/UF do responsável técnico. Quem contrata e emite o documento fiscal: profissional ou organização contábil?
   Resposta: __________.
2. Defina o valor e o escopo de cada serviço:

   | Serviço | Valor base (R$) | Escopo incluído | Quando exige análise manual |
   |---|---|---|---|
   | Inicial | __________ | __________ | __________ |
   | Liquidação/execução | __________ | __________ | __________ |
   | Análise técnica de impugnação | __________ | __________ | __________ |
   | Atualização | __________ | __________ | __________ |

3. O preço inclui PDF, arquivo .PJC, parecer assinado, esclarecimentos e revisões? O que será separado?
   Resposta: __________.
4. Quantas verbas entram na base? Como contar as excedentes e quanto cobrar por elas?
   Resposta: __________.
5. Qual período entra na base? Como cobrar excedentes, frações e períodos descontínuos?
   Defina como contar meses parciais (inclui todo mês tocado, mês completo ou proporcional), contratos sem demissão informada e a data que encerra o período. A data-base não será presumida como fim do contrato.
   Resposta: __________.
6. Quantos meses ou páginas de cartões de ponto estão incluídos? Como diferenciar dados digitais, digitação e imagens pouco legíveis?
   Resposta: __________.
7. Quantos reclamantes entram na base? Qual adicional por pessoa e quando diferenças entre contratos exigem orçamento próprio?
   Resposta: __________.
8. Quantas revisões estão incluídas? Como distinguir correção, esclarecimento e novo serviço após documento ou decisão posterior? Defina também a condição de cancelamento/garantia, a taxa de triagem e seu abatimento no serviço (D5).
   Resposta: __________.
9. Os adicionais podem acumular? Há teto, desconto por volume ou exceção que impede orçamento automático? Quem autoriza e registra o motivo?
   Resposta: __________.
10. Quando aceita urgência, qual é o prazo mínimo e qual adicional aplica? Sobre qual base incide o percentual? Quem confirma capacidade?
    Resposta: __________.
11. Defina critérios objetivos e prazo padrão por complexidade:

    | Complexidade | Critérios | Prazo padrão em dias úteis |
    |---|---|---|
    | Simples | __________ | __________ |
    | Média | __________ | __________ |
    | Alta | __________ | __________ |

12. Quantos dias úteis de folga exige antes do vencimento processual? Quem confere o TRT e o calendário? Como agir quando faltar tempo? A regra do portal exige entrega prometida ≤ prazo interno ≤ vencimento menos folga; confirme essa ordem ou registre a decisão de alteração antes de implementá-la.
    Resposta: __________.
13. O prazo começa após quais condições: aceite, sinal, documentos ou esclarecimentos? Como tratar pendências e horário de corte?
    Como registrar capacidade e compromissos da agenda para propor a entrega automaticamente, incluindo a reserva concorrente de disponibilidade e a modalidade de urgência?
    Resposta: __________.
14. Quanto tempo vale a proposta? Como versionar reajustes, contratos recorrentes e mudança de escopo depois do aceite?
    Resposta: __________.
15. Confirme entrada de 50%, saldo e modalidades, incluindo clientes com contrato. Quem será o titular recebedor do Pix e quem conferirá os dados antes da cobrança? Informe a chave pelo canal aprovado; nenhuma senha ou credencial neste formulário.
    Resposta: __________.

Quais respostas ainda são estimativas? O que exige decisão com Fábio antes de virar regra do portal?
Resposta: __________.

Referência: [NBC PG 01 — CFC](https://www1.cfc.org.br/sisweb/SRE/docs/NBCPG01.pdf), itens 7–10 sobre proposta e condições, e item 4(r) sobre identificação profissional. Valores do seed local são fictícios e permanecem inativos.

O motor guarda a versão da tabela, discrimina base e adicionais e calcula o sinal de 50% arredondando para cima em centavos. Urgência usa pontos-base. Valor zero significa adicional gratuito explicitamente configurado; não significa preço desconhecido. Tabela incompleta é recusada.

app/src/modules/quotes/example-table.ts contém apenas o exemplo isExample: true de M2.07. Ele não é usado para contratação nem como preço público.

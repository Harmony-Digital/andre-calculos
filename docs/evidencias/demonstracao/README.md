# Demonstração fictícia — roteiro e verificações

## Roteiro da apresentação

1. Abrir `/demonstracao` e escolher **Conhecer a área do advogado**.
2. Explorar a visão geral de Marina Duarte, personagem fictícia: processos, propostas e entregas.
3. Escolher **Solicitar orçamento**. Percorrer as nove etapas com exemplos preenchidos; mudar verbas, serviço ou urgência para ver a composição do preço.
4. Gerar a proposta: serviços discriminados, total, entrada de 50%, saldo, prazo, responsável e CRC fictício. A proposta pode ser impressa/salva como PDF pelo navegador.
5. Marcar a leitura da proposta e **Simular aceite**. Simular o sinal e anexar o documento fictício; só então o pedido entra na fila.
6. Abrir **Linha do tempo**: eventos simulados têm horário; etapas futuras não são apresentadas como fatos ocorridos.
7. Escolher **Explorar como → Calculista** e avançar análise, elaboração, revisão e entrega fictícias. Voltar à visão do advogado para explorar documentos e mensagens.
8. **Reiniciar** restaura os três exemplos originais. Os pedidos extras e mensagens ficam apenas no navegador utilizado.

## Dados e isolamento

- Marca provisória: Marco Cálculos Judiciais.
- Responsável: André Costa, personagem fictício; CRC `DEMO-000000/O`, propositalmente fictício.
- Advogada: Marina Duarte; empresas/processos/documentos inventados.
- Tabela `demo-2026-v1`, valores em centavos. Exemplo inicial de liquidação: R$ 450,00 base + duas verbas a R$ 100,00 = R$ 650,00; sinal/saldo de R$ 325,00.
- Referência temporal: 13/10/2026; suspensão fictícia em 23/10. Calendário não validado de TRT e sem utilização para prazos reais.
- Rota isolada, sem ações de servidor, banco, autenticação real, cobrança, assinatura ou notificações. Nenhum upload real é realizado.
- A demonstração não habilita os modos locais de teste nem modifica as guardas do produto. Publicação da raiz na Vercel encaminha para `/demonstracao` por redirect temporário em `app/vercel.json`.

## Evidências reproduzíveis

- `npx vitest run src/modules/demo/model.test.ts`: oito casos aprovados — totais/snapshot, adicionais, período, checklist inválido, prazo, pré-condições da fila, revisão/entrega e restauração de estado.
- `npx playwright test tests/e2e/demo.spec.ts --workers=2`: quatro casos aprovados, em 375 e 1440 px — jornada completa, recarga, mensagens, download ilustrativo, calendário, reinício, armazenamento indisponível e prazo insuficiente.
- Axe WCAG A/AA e verificação de largura nas telas percorridas; zero chamadas HTTP para serviços externos durante a jornada.
- Format, lint, tipos, 348 testes unitários e doze testes de scripts aprovados. O build Turbopack local continua limitado pelo ambiente ao abrir a porta interna, como na verificação anterior do projeto; a conclusão do build exige evidência do CI.

O status e a publicação ficam exclusivamente no `plan.md`.

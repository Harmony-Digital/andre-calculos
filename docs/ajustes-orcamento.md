# Ajuste de orçamento e histórico de versões

O calculista abre a proposta na pasta do processo e seleciona **Ajustar orçamento**. Ele edita os valores unitários dos serviços e informa um motivo obrigatório. A tela mostra o novo total, o sinal e o saldo antes do envio. O motivo será visível ao advogado.

**Criar nova versão** registra outra proposta, com número próprio, contexto de contratação e PDF novos. Quantidades, descrições, tabela-base, condições e fontes de prazo são preservadas. Valores em centavos, total e sinal são recalculados no servidor; o navegador não fornece um total para ser aceito sem conferência.

## Consulta e decisão

O advogado e o calculista veem o histórico, com número, versão, data, valor e motivo. A pasta apresenta a versão vigente antes das anteriores. Cada link abre o conteúdo correspondente e mantém seu PDF disponível. A proposta nova também é enfileirada para aviso ao cliente; o transporte real depende da configuração e autorização próprias de notificações.

Uma versão substituída informa que é histórica e oferece o link para a vigente. Ela não pode ser aceita ou recusada. A proposta vigente pode receber aceite ou recusa pelas mesmas regras de contratação do portal. Somente a versão vigente aparece na contagem e na paginação de propostas abertas do painel.

## Proteções

- O ajuste exige papel de calculista e pedido ainda orçado, sem aceite, pagamento ou recusa.
- Tabela, configuração, textos e disponibilidade precisam continuar válidos. Se mudaram, o ajuste fica bloqueado para reconferência; não são renovados silenciosamente.
- A revisão da proposta, o hash do contexto e a revisão do pedido protegem contra decisões baseadas em tela antiga.
- Ajuste, aceite e recusa usam a mesma ordem de locks. Uma disputa tem somente uma decisão vencedora.
- Após falha ou resposta perdida, os campos e o UUID da solicitação são preservados. **Tentar novamente** recupera o recibo original, sem gerar outra versão. Um UUID com outros dados é recusado.
- Proposta/contexto anteriores, tabela-base e recibo do ajuste permanecem imutáveis. Motivo, autoria e antes/depois ficam registrados; o histórico do processo recebe o evento **Orçamento ajustado**.
- Outros clientes, admin e anônimos não ganham acesso às propostas, PDFs ou à ação de ajuste.

O recurso não reabre pedidos cancelados/recusados e não altera propostas contratadas. Emissão comercial, ativação em nuvem e publicação conservam as condições do projeto. O status e o ponto de retomada ficam exclusivamente em [plan.md](../plan.md#onde-estamos).

## Verificação dirigida

Com o runtime exclusivo do projeto pronto, a partir da raiz:

```sh
bash scripts/dev-env.sh npm run test:rls -- tests/integration/quote-revision.test.ts
bash scripts/dev-env.sh npm run test:e2e -- tests/e2e/quote-revision.spec.ts --workers=1
```

Os testes usam somente dados fictícios e limpam as versões/contratos temporários. Não os executar em paralelo com outro escritor do banco. As regras puras de entrada e arredondamento ficam em `app/src/modules/quotes/revision.ts`; o comando transacional é `revise_quote_system` e o contexto de histórico é `get_quote_revision_context`.

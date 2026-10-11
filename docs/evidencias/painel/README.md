# Ensaios locais da visão geral do painel (M2.32)

Data: 2026-10-11. Aplicação em `127.0.0.1:3000`, Supabase local exclusivo
`andre-calculos`, contas e registros inteiramente fictícios.

## O que foi conferido

- Os seis cartões consultam contagens exatas no banco, antes de qualquer limite
  de paginação. O ensaio tem 116 pedidos atrasados na fila e 61 propostas abertas.
- Cadastros consideram somente perfis de cliente e a janela móvel de sete dias
  corridos; perfis internos e cadastros com data futura não entram.
- Propostas abertas são ofertas individuais válidas, sem aceite, de pedidos
  orçados. Ofertas expiradas, aceitas e de pedido entregue ficam fora. Mais de
  uma oferta válida do mesmo pedido aparece individualmente, como na lista.
- Aguardando pagamento e na fila usam os estados correspondentes. Vencendo e
  atrasados abrangem os seis estados em andamento, inclusive ajustes; pedidos
  com prazo ausente e estados encerrados não entram nesses dois indicadores.
- Prazos usam o dia civil de São Paulo e o calendário processual provisório.
  O teste unitário cobre a virada do dia, o fim de semana, feriado e recesso.
- Cartões abrem a seleção correspondente. Os 116 atrasados foram recuperados
  em páginas de 50/50/16 e as 61 propostas em 50/11, sem perda ou repetição;
  filtros permanecem na navegação. Os cinco próximos trabalhos vêm da fila.
- Cliente recebe acesso negado ao painel e às listas. Admin tem entrada para
  configurações, sem indicadores ou listas operacionais. Consultas dessas
  listas continuam exclusivas do calculista e usam a sessão com RLS.
- Seleções e cursores inválidos retornam 404. Axe não encontrou violações nas
  páginas verificadas e não houve transbordamento horizontal em 375/1440 px.

As consultas e páginas refletem a base no momento de cada requisição. Mudanças
ou vencimentos entre a leitura do cartão e a abertura/paginação da lista podem
alterar os registros disponíveis; não há congelamento transacional do painel.

## Verificação executada

```sh
bash scripts/dev-env.sh npm run check
bash scripts/dev-env.sh npm run test:e2e -- --workers=4 tests/e2e/dashboard.spec.ts tests/e2e/decisions.spec.ts tests/e2e/queue.spec.ts
bash scripts/dev-env.sh npm run test:e2e -- --workers=4
bash scripts/dev-env.sh npm run test:e2e -- --workers=2 tests/e2e/dashboard.spec.ts
```

- `check`: formatação, lint, tipos, 271 unitários com cobertura e build aprovados.
- Regressão de painel/decisões/fila: dez ensaios aprovados nas duas larguras.
- Suíte completa: 79 aprovados, cinco ensaios únicos omitidos no projeto celular.
- Conferência final do espaçamento das listas: dois ensaios aprovados, com novas
  capturas e axe. As capturas abaixo são desse estado final.

A primeira regressão revelou que o login/logout do admin depende da entrada
`/painel`. A entrada agora mostra apenas as configurações, preservando a
restrição aos dados operacionais.

Depois dos ensaios foram conferidos quatro perfis fictícios, dois clientes com
papel de cliente, zero processos/entregas/aprovações temporários e nenhuma tabela
real de preços ativa. Identificação profissional, Pix, versões legais aprovadas
e regra de entrega permaneceram vazios. Nenhuma migration foi necessária nesta
entrega; as 28 migrations locais e as 25 tabelas públicas/duas internas com RLS
permanecem iguais.

## Capturas

| Página | Computador | Celular |
|---|---|---|
| Visão geral | [1440 px](painel-calculista-1440.png) | [375 px](painel-calculista-375.png) |
| Clientes filtrados | [1440 px](clientes-filtrados-1440.png) | [375 px](clientes-filtrados-375.png) |
| Segunda página de propostas | [1440 px](propostas-paginadas-1440.png) | [375 px](propostas-paginadas-375.png) |

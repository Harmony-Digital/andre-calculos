# Verificação local do checklist

Ensaio em 2026-10-11, apenas com processo e usuários fictícios no Supabase local do André.

- `npm run check`: 220 testes unitários, lint, tipos e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls`: 19 testes de isolamento aprovados, incluindo alteração concorrente do rascunho e cliente sem propriedade.
- `bash scripts/dev-env.sh npm run test:e2e`: 41 aprovados e três ensaios únicos omitidos no celular; checklist completo e retomada executados em 375 e 1440 px.
- Nove migrations locais; `supabase db lint --local` e advisors locais de segurança/desempenho sem achados.

O navegador preenche nove etapas, recarrega depois da primeira, retoma pela lista e preserva as instruções. As consultas confirmam schema 1, última etapa 8 e revisão 9. O pedido permanece rascunho, sem cobrança, sem proposta e sem entrada na fila. Outro cliente recebe 404 para rascunho e pasta do processo.

A RPC recusa revisão antiga, alterações por outro cliente e mudança de identificação de um processo já compartilhado por pedidos ou arquivos. A migration 0009 corrige a qualificação de variável detectada pelo teste real da primeira versão.

Imagens: `rascunho-celular.png` e `rascunho-computador.png`. A validação dos campos pelo André e o ensaio na nuvem continuam no `plan.md`.

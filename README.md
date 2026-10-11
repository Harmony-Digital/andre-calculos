# Portal de Cálculos Judiciais do André

Portal para advogados contratarem e acompanharem cálculos judiciais realizados e revisados pelo André. Requisitos em `PRD.md`, instruções em `AGENTS.md` e andamento exclusivamente em `plan.md`.

## Desenvolvimento

Requer Node.js 22 ou superior. Na pasta `app`, execute `npm ci` e `npm run dev`. A aplicação fica em <http://localhost:3000>. Execute `npm run check` para formatação, lint, tipos, testes e build; `npm run test:e2e` verifica a navegação e a acessibilidade em celular e computador.

As páginas provisórias da fundação usam somente dados fictícios e não recebem documentos reais. O Supabase local completo, quando disponível, será iniciado conforme o plano M1.40. Não use as CLIs já autenticadas em contas de outros clientes.

## Estrutura

- `app/`: Next.js, interface e casos de uso em `src/modules`.
- `docs/`: transcrição, pesquisas e documentação de operação.
- `scripts/`: conferência das contas e comandos auxiliares.
- `supabase/`: migrations, configuração local e seed fictício.

Antes de qualquer escrita externa, confira a identidade pelo preflight. Segredos são fornecidos pelo cofre do projeto; jamais são registrados no código, Git ou saída dos comandos.

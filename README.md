# Portal de Cálculos Judiciais do André

Portal para advogados contratarem e acompanharem cálculos judiciais realizados e revisados pelo André. Requisitos em `PRD.md`, instruções em `AGENTS.md` e andamento exclusivamente em `plan.md`.

## Desenvolvimento

Requer Node.js 22 ou superior. Na pasta `app`, execute `npm ci`. Execute `npm run check` para formatação, lint, tipos, testes e build. Copie `scripts/contas-esperadas.example` para `scripts/contas-esperadas.env` e confira os identificadores antes de usar o preflight.

O desenvolvimento usa somente dados fictícios. Não use `supabase link`, `db push` ou as contas de nuvem já autenticadas na CLI de outros clientes.

### Supabase local

No macOS, use o perfil Docker exclusivo `andre-calculos` do Colima. A configuração usa PostgreSQL 17, API na porta 54321, Studio na 54323 e Mailpit na 54324. Os serviços de nuvem não são acessados pelos comandos abaixo.

```sh
colima start --profile andre-calculos --cpus 4 --memory 8 --disk 60 --activate=false --ssh-config=false --mount "$PWD:w"
DOCKER_HOST="unix://$HOME/.colima/andre-calculos/docker.sock" node app/scripts/start-local.mjs
bash scripts/dev-env.sh ../app/node_modules/.bin/tsx ../scripts/seed-dev.ts
bash scripts/dev-env.sh npm run dev -- --hostname 127.0.0.1
```

Abra <http://127.0.0.1:3000>. O wrapper passa as chaves locais somente ao processo: não cria `.env.local` nem imprime valores. O seed cria cliente A, cliente B, calculista e admin `@exemplo.com`, com senha aleatória em memória; não fornece senhas fixas de teste.

```sh
bash scripts/dev-env.sh npm run test:rls
bash scripts/dev-env.sh npm run test:e2e
```

Esses comandos renovam o seed com credenciais efêmeras e verificam sessões e RLS reais. O login fica protegido por cookies HttpOnly; consultas de negócio passam pelo servidor. Uploads terão permissões assinadas para um único caminho. O cadastro público depende de termos e política aprovados, com versões registradas em `settings`; rascunhos não ativam consentimento em produção.

### Cofre de desenvolvimento

`bash scripts/com-segredos.sh npm run dev` usa as referências de `app/.env.tpl`, exige a conta de serviço com acesso exclusivamente a `proj-andre-calculos` e mantém a saída mascarada pelo 1Password. O Fábio cadastra os itens ausentes. As variáveis de produção estão documentadas em `docs/variaveis-producao.md`.

## Estrutura

- `app/`: Next.js, interface e casos de uso em `src/modules`.
- `docs/`: transcrição, pesquisas e documentação de operação.
- `scripts/`: conferência das contas e comandos auxiliares.
- `supabase/`: migrations, configuração local e seed fictício.

Antes de qualquer escrita externa, confira a identidade pelo preflight. Segredos são fornecidos pelo cofre do projeto; jamais são registrados no código, Git ou saída dos comandos.

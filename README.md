# Portal de Cálculos Judiciais do André

Portal para advogados contratarem e acompanharem cálculos judiciais realizados e revisados pelo André. Requisitos em `PRD.md`, instruções em `AGENTS.md` e andamento exclusivamente em `plan.md`.

Para retomar em uma nova sessão, comece por [plan.md — Onde estamos](plan.md#onde-estamos), que reúne o ponto de continuidade, evidências e pendências. Leia também o protocolo de sessão de `AGENTS.md`.

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

Esses comandos renovam o seed com credenciais efêmeras e verificam sessões e RLS reais. O login fica protegido por cookies HttpOnly; consultas de negócio passam pelo servidor. Uploads usam permissões assinadas para um único caminho. O cadastro público depende de termos e política aprovados, com versões registradas em `settings`; rascunhos não ativam consentimento em produção. O ensaio de cadastro usa versões fixture-termos-v1 e fixture-privacidade-v1 só em localhost e restaura settings ao terminar. O Mailpit local recebe confirmação, recuperação e link de acesso; nenhum e-mail sai para destinatários reais.

O ensaio conectado do cadastro ao download mantém duas sessões e o mesmo pedido. Preparações sintéticas, limites e job do CI em [docs/jornada-local.md](docs/jornada-local.md).

### Checklist e rascunhos

Cada etapa concluída é salva no banco como rascunho versionado. O cliente retoma pela lista de rascunhos ou pela URL do pedido; as respostas não ficam em localStorage. Uma revisão antiga é recusada para preservar alterações feitas em outra sessão. O rascunho não emite proposta nem entra na fila sem as condições comerciais.

### Configurações

Calculista e admin usam `/painel/configuracoes` para editar identificação profissional, contato, Pix, condições, horários e limites de complexidade. Cada alteração de preço cria uma versão; tabelas de exemplo ficam inativas. A ativação exige confirmação dos valores e prazos, e congela os itens daquela versão. As configurações têm revisão para recusar uma gravação baseada em estado antigo. O site recebe apenas a projeção pública dos dados profissionais e da garantia, sem a chave Pix.

### Propostas

O calculista registra clientes que pagam no final em `/painel/clientes`, com motivo, revisão e histórico privado. O contrato dispensa sinal, preserva pagamentos/aceites e exige documento confirmado para a fila. Regras de retirada e reenvio em `docs/clientes-com-contrato.md`.

O fluxo do checklist prepara proposta numerada, snapshot imutável e PDF privado com CRC. A emissão comercial exige calendário, disponibilidade, período e dados reais confirmados. O ensaio fictício tem opt-in exclusivo do servidor local, indicação em tela/PDF e contratação bloqueada. Recuperação, regras e comandos em `docs/propostas.md`.

O calculista pode criar uma nova versão com valores ajustados e motivo obrigatório; o advogado consulta a vigente e o histórico preservado. Regras e operação em [docs/ajustes-orcamento.md](docs/ajustes-orcamento.md).

O calculista consulta autorizações de visualização/download em `/painel/acessos`, com filtros de arquivo, autor, período e ação. Semântica do registro, paginação e permissões em [docs/acessos-arquivos.md](docs/acessos-arquivos.md).

### Contratos

O aceite registra uma intenção de geração e congela os dados do contrato. O processador confere os bytes arquivados antes de disponibilizar o PDF privado na proposta e na pasta do processo. Recuperação, permissões, restrição do produtor ao ambiente local e comandos de verificação em [docs/contratos.md](docs/contratos.md).

### Lembretes de prazo

A seleção local usa dias úteis para avisos de um/dois dias e gera um aviso de atraso por prazo interno. Janela de 07h até antes de 21h independente dos horários pontuais, recibos privados e cancelamento de pendentes evitam duplicação e avisos obsoletos. O endpoint exige Bearer; calendário provisório bloqueia execução em nuvem. Regras e ativação em `docs/lembretes-de-prazo.md`.

### Cofre de desenvolvimento

`bash scripts/com-segredos.sh npm run dev` usa as referências de `app/.env.tpl`, exige a conta de serviço com acesso exclusivamente a `proj-andre-calculos` e mantém a saída mascarada pelo 1Password. O Fábio cadastra os itens ausentes. As variáveis de produção estão documentadas em `docs/variaveis-producao.md`.

## Estrutura

- `app/`: Next.js, interface e casos de uso em `src/modules`.
- `docs/`: pesquisas e documentação de operação. A transcrição sigilosa fica somente na pasta local, ignorada pelo Git.
- `scripts/`: conferência das contas e comandos auxiliares.
- `supabase/`: migrations, configuração local e seed fictício.

Antes de qualquer escrita externa, confira a identidade pelo preflight. Segredos são fornecidos pelo cofre do projeto; jamais são registrados no código, Git ou saída dos comandos.

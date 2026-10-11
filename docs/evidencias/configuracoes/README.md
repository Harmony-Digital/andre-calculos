# Verificação local das configurações

Ensaio em 2026-10-11 no Supabase local do André, com identificação, CRC, Pix e preços inteiramente fictícios.

- `npm run check`: 232 testes unitários, formatação, lint, tipos e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls`: 24 testes aprovados. Configurações e preços negados a cliente/anônimo; DML direto negado; revisão antiga recusada; exatamente uma ativação concorrente aceita.
- `bash scripts/dev-env.sh npm run test:e2e`: 44 aprovados, quatro ensaios únicos omitidos no celular. Formulários e axe verificados em 375/1440 px; edição compartilhada de settings executada uma vez.
- Onze migrations locais; SQL lint e advisors de segurança/desempenho sem achados.

As versões antigas preservam os parâmetros e itens, mesmo após substituição. O teste tenta alterar e excluir uma versão ativada e inserir/editar itens com o papel de sistema: os triggers recusam. A versão associada a um pedido fictício permanece a mesma depois de ativar novos preços.

O navegador salva dados profissionais, encontra nome/categoria/CRC e garantia no site, sem Pix público; salva exemplo inativo e ativa duas versões sintéticas. O formulário retorna ao modo exemplo após cada gravação, exigindo nova confirmação para ativar.

O classificador recebe somente seus limites por RPC; `settings` continua restrita ao calculista/admin. Os ensaios que alteram settings usam uma exclusão mútua local para preservar a fixture de consentimento do cadastro.

Read-back depois da suíte: zero versões ativas, dados profissionais e versões legais restaurados. As versões históricas sintéticas são preservadas no banco local. Nenhuma alteração foi aplicada na nuvem.

Imagens: visão completa e recortes visíveis de dados/preços, em celular e computador. O fechamento de M2.33 depende dos insumos e da ligação à proposta, conforme `plan.md`.

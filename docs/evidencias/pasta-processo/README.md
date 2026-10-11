# Verificação local da pasta do processo

Ensaio em 2026-10-11 no Supabase local do André, com usuários e PDFs inteiramente fictícios.

- `npm run check`: 245 unitários, formatação, lint, tipos e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls`: 28 aprovados, incluindo auditorias distintas de visualização/download, recusa de arquivo pendente e bloqueio da entrega antes do estado liberado.
- `bash scripts/dev-env.sh npm run test:e2e`: 49 aprovados; cinco ensaios únicos omitidos no projeto celular. Navegação, PDF, senha, axe e largura conferidos em 375/1440 px.
- Migration local `20261011001200_andre_calculos_0012_file_view_audit.sql`; SQL lint e advisors de segurança/desempenho sem achados.
- `npm audit --omit=dev`: zero vulnerabilidades. Os cinco alertas altos transitivos das ferramentas de desenvolvimento permanecem registrados no plano.

As seis abas usam os mesmos componentes no cliente e no painel. O cliente B, admin e anônimo não acessam o arquivo/processo do cliente A; o calculista acessa. Documentos são agrupados em Processo, Documentos do cliente, Entregas e Triagem.

O visualizador usa React-PDF 11.0.0 com PDF.js 6.3.289, worker/recursos locais e uma página por vez. A leitura passa por endpoint privado auditado, aceita HEAD e intervalos únicos, responde 206/416 e mantém a assinatura do Storage no servidor. O download permanece com URL de 120 segundos. Hash do upload calculado em blocos de 4 MiB e reconferido no servidor; arquivo de 300 MiB retomou do offset de 12 MiB depois de cortar a rede.

Dois PDFs sintéticos de duas páginas foram renderizados e inspecionados, incluindo acentos. Uma fixture contém URI externa e OpenAction JavaScript; o ensaio não registrou requisição para essa URI ou diálogo do script. Anotações/formulários estão desativados; texto permanece selecionável. O PDF protegido aceita senha, recusa senha errada, cancela e reabre; a senha sintética não apareceu em requisições, console ou localStorage/sessionStorage. A região de rolagem recebe foco e responde ao teclado.

Um PDF sintético acima de 6 MiB foi transmitido integralmente e visualizado com requisições por intervalo. Isto confirma a implementação local; não confirma 500 MB na Vercel. A [documentação oficial da Vercel](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) permite respostas streaming acima de 4,5 MB, mas duração, memória, banda e conexão lenta ainda precisam de ensaio hospedado.

Os conteúdos das abas Mensagens, Decisões e Índice são projeções de leitura. As próximas entregas e pendências ficam somente no `plan.md`.

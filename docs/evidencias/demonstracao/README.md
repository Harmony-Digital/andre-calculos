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
- [CI 38153083358](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38153083358), revisão `abe2fb4fbb8003d383c59f051fad53a42b47102b`: `npm run check` com formato, lint, tipos, 348 unitários, doze testes de scripts e build aprovado; 142 testes de RLS, 113 e2e/sete omissões e advisors locais de segurança/desempenho sem achados. Os quatro e2e da demonstração integram esse total.
- Verificação adicional no navegador: dois meses de cartões em imagem e urgência de 30% produziram R$ 936,00 (450 + 200 + 70 + 216), entrada/saldo de R$ 468,00 e entrega fictícia em 26/10/2026.

## Fonte e pacote conferidos

- [PR #2](https://github.com/Harmony-Digital/andre-calculos/pull/2) integrado pela proteção normal da main em `9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd`; aplicativo idêntico à revisão aprovada no CI.
- Pacote local `/private/tmp/andre-calculos-demo.zip`: 158 arquivos, `package.json` na raiz, SHA-256 `85d678b463ef38fe5d3e3ddfd36fe4fdf2cebf49c82cc85b9b808d56ba7a8859`. Cada arquivo foi comparado com a main. Manifesto: `pacote-manifesto.json`.
- Pacote sem `.env*`, `.git`, áudio, transcrição, testes, `node_modules` ou `.next`. Fontes e script de assets necessários ao build incluídos.
- Painel Vercel conferido na conta cliente, equipe `Projeto Andre`/`projeto-andre1`/`team_4fdLDCsB0ROvP5ph50aFNvxm`; projeto `andre-calculos`/`prj_tdmzmC6utVU2fHPz0iVhroMD8NtI`. Ajustes salvos: Next.js, Node 22, raiz vazia e comandos padrão. Sem integração Git, variáveis de ambiente ou aquisição de plano/domínio.
- O seletor automatizado recusou o envio por falta de acesso da extensão a URLs de arquivo. A tentativa seguinte de leitura da aba recebeu a recusa de segurança: acesso a vercel.com negado pelo usuário. Nenhuma publicação ou acesso alternativo foi tentado após essa recusa.
- Em 2026-10-11, Fábio respondeu "Autorizar acesso e publicação somente nesse projeto". O preflight GitHub/cofre/remoto passou; a leitura normal da mesma aba foi novamente recusada pela proteção do navegador, desta vez identificando preferência salva que bloqueia `vercel.com`. Nenhum contorno foi tentado. A [documentação oficial da extensão](https://learn.chatgpt.com/docs/chrome-extension#manage-allowed-and-blocked-websites) orienta remover o domínio da lista de bloqueados em Configurações → Computer Use → Chrome → Manage; para upload automático, exige "Allow access to file URLs". O Fábio recebeu a opção de ajustar essas permissões ou enviar o ZIP manualmente.
- Auditoria independente somente de leitura repetiu a comparação dos 158 arquivos, tamanhos e hashes com a main e o manifesto, sem divergências nem conteúdo privado reconhecido. Identidade esperada do projeto registrada também em `scripts/contas-esperadas.env` e `AGENTS.md` §7.
- Após Fábio informar "Concluí os dois ajustes", a leitura normal da mesma aba foi novamente recusada por preferência salva que bloqueia `vercel.com`. Uma inspeção somente de leitura das configurações do aplicativo Codex foi recusada por política do próprio app. Não houve tentativa de acessar a Vercel por outra superfície. O ZIP foi novamente conferido contra a main por auditor independente e copiado para `.data/publicacao/andre-calculos-demo.zip`, com o mesmo SHA-256; essa pasta é ignorada pelo Git.
- [Vercel Drop](https://vercel.com/docs/drop) documenta envio de código de framework em ZIP ao projeto sem Git; isso não substitui a integração contínua de M1.50. Upload sem Git não informa o SHA de commit ao endpoint de saúde; a procedência é a comparação do pacote acima.

## Envio manual do pacote pelo Fábio

1. Abrir `https://vercel.com/projeto-andre1/andre-calculos` na conta do cliente, equipe Projeto Andre. Usar o projeto existente `prj_tdmzmC6utVU2fHPz0iVhroMD8NtI`.
2. Escolher **Choose a file to deploy** e selecionar `.data/publicacao/andre-calculos-demo.zip` desta pasta. No seletor do Mac, Command + Shift + G permite informar o caminho completo do arquivo.
3. Se o painel mostrar uma revisão antes da publicação, conservar Next.js, Node 22 e Root Directory vazio: o `package.json` está na raiz do ZIP. Publicar e compartilhar o endereço `.vercel.app` exibido para a verificação da jornada pública.

O status e a publicação ficam exclusivamente no `plan.md`.

## Publicação pelo MCP e jornada hospedada em 2026-10-11

Fábio confirmou novo consentimento exclusivamente para Projeto Andre/andre-calculos. O OAuth oficial terminou com sucesso; o MCP dedicado confirmou os IDs da equipe/projeto, lista com somente esse recurso e consulta de deploys acessível. Foi usado create_deployment com os 158 arquivos do pacote conferido contra a main, sem integração Git, cadastro de variáveis, domínio próprio ou serviços reais.

- Endereço original público: [demonstração](https://project-rucji.vercel.app/demonstracao). A raiz redireciona para essa rota. Ensaio em navegador sem cookies de login da Vercel.
- Deploy final: `dpl_D8FCmhRtUpTP4mftZr7RfbW6jeZ7`, target production, READY, regiões `gru1`. IDs de equipe/projeto iguais aos esperados.
- A primeira publicação `dpl_CBdhLxTeuehTuzbHGji5ubKbwxKY` respondeu health em iad1, apesar do vercel.json versionado. Ajuste pelo MCP update_project, somente resourceConfig.functionDefaultRegions=[gru1], seguido de novo envio dos mesmos arquivos com projectSettings.serverlessFunctionRegion=gru1. Novo health HTTP200, status ok, versão0.1.0 e region gru1. A causa de o arquivo não ter prevalecido não foi estabelecida.
- Health retorna sha vazio porque o envio não possui integração Git; a procedência está na comparação do ZIP com main9a25f31 e no manifesto. Não tratar o endpoint como comprovação de SHA remoto.
- Quatro testes hospedados aprovados em 11,9 s: jornada completa e armazenamento indisponível/prazo insuficiente, em 1440×1000 e 375×812. axe A/AA sem violações nas etapas avaliadas; sem rolagem horizontal ou requisições a outros serviços.
- Jornada percorreu orçamento de R$650, proposta, aceite/sinal/documento simulados, fila, linha do tempo, visão do calculista, revisão/entrega, mensagem local, recarga, download fictício, calendário e reinício.
- Harness local ignorado em .data/publicacao/qa-hospedada: reutiliza demo.spec.ts com origem da baseURL autorizada, imports locais, webServer desativado e sem segredos. Comando: app/node_modules/.bin/playwright test --config=.data/publicacao/qa-hospedada/playwright.config.ts --project=computador --project=celular --workers=1 --retries=0. O ensaio completo foi seguido de duas jornadas para recapturar as quatro etapas por tamanho, colocando a página no topo antes do screenshot.
- Oito capturas em hospedada/ e metadados em hospedada/validacao.json. Conferência visual da apresentação, proposta, timeline e entrega.
- O alias gerado andre-calculos-projeto-andre1.vercel.app pediu login em acesso anônimo. A proteção do projeto foi preservada; a apresentação usa o domínio original público project-rucji.vercel.app.

Aplicativo idêntico à main aprovada no CI38153083358; nenhuma mudança de código nesta publicação. A integração contínua/comercial de M1.50 e os GATEs humanos continuam tratados no plan.md.

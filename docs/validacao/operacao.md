# Primeira validação com o André

O objetivo é apresentar os fluxos já construídos usando somente dados fictícios no projeto Vercel `andre-calculos`, da equipe `Projeto Andre`, com o domínio `https://project-rucji.vercel.app`. A raiz abre `/entrar`; a demonstração anterior permanece em `/demonstracao`.

O estado efetivo da publicação fica somente em `plan.md`, seção Onde estamos. Este documento descreve a operação; o manifesto base reserva identificadores e não comprova que contas ou processos já foram criados.

## Pré-requisitos do destino

1. O MCP `andre-calculos-vercel` lista apenas Projeto Andre e confirma projeto/equipe/domínio.
2. O MCP `andre-calculos-supabase` precisa estar disponível nesta sessão; `get_project_url` deve devolver exatamente `https://qtofwbxujshroaafxowr.supabase.co`. A configuração local ou uma autenticação anterior não substitui essa consulta. Não usar outro MCP, banco ou API administrativa para contornar falta de acesso.
3. Inventariar migrations e tabelas no destino. Aplicar apenas as migrations versionadas ausentes via `apply_migration`; não apagar, resetar nem sobrescrever dados existentes. Se houver usuários/processos/configuração real, parar a semeadura fictícia e confirmar o isolamento.
4. Para esta primeira validação, o agente está autorizado pelo pedido “Configure e publique” a cadastrar na Vercel, em Production, `APP_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `ANDRE_VALIDATION_MODE=1`. Essa autorização específica prevalece sobre a atribuição geral das variáveis ao Fábio no AGENTS.md. Valores secretos não entram neste documento, no repositório ou no chat; login e consentimento OAuth continuam humanos. As duas origens devem corresponder ao manifesto. System Environment Variables devem expor `VERCEL=1`, `VERCEL_ENV=production` e o `VERCEL_PROJECT_ID` correto.
5. Não cadastrar credenciais de provedores reais, `CRON_SECRET`, cron ou transporte externo. O opt-in de validação não habilita Asaas, e-mail, WhatsApp nem cadastro público com textos em rascunho.

## Cenários e acesso

`manifesto-base.json` reserva três contas fictícias e quatro pastas. O roteiro principal usa orçamento, cálculo em andamento e entrega; a atualização fica na pasta do pedido entregue. A pasta do outro cliente serve à conferência de isolamento.

As contas não pertencem a pessoas reais. O provisionamento deve usar os grants administrativos existentes, sem fabricar consentimento legal. O Fábio define e compartilha o acesso privado fora do chat. Não gerar senha fixa de demonstração no código nem publicar link de autenticação. Não enviar convites para os endereços `.invalid`.

Para obter as senhas geradas pelo helper de recuperação, mantenha o Terminal desse helper aberto. Em outro Terminal, execute `.data/validacao/acesso-ficticio-privado.mjs` com Node e a opção `--advogada` ou `--andre`, uma conta de cada vez. O utilitário copia somente a senha fictícia para a área de transferência, sem exibi-la. Use respectivamente `advogada@validacao.invalid` ou `andre@validacao.invalid` em `/entrar` e cole a senha no campo correspondente. Guarde as senhas no cofre pessoal antes de encerrar o helper; chave e senhas não são persistidas pelo processo. O terceiro perfil é reservado à conferência de isolamento.

Os estados sintéticos são preparados de forma identificada e restrita aos IDs reservados. Não executar `seed-local.ts`, helpers de Playwright ou dumps locais na nuvem: eles trocam credenciais, alteram settings e removem fixtures no encerramento.

O orçamento novo do checklist continua uma **simulação sem aceite**. O cenário contratável separado usa o mesmo formato dos ensaios de contratação, com termos explicitamente fictícios e sem vigência; não representa aprovação comercial. As configurações não podem habilitar cadastro público nem cobranças reais. Índice, decisões, sinais manuais, contratos e entregas seguem suas autorizações e recibos existentes.

Os PDFs de amostra são cópias do documento fictício versionado usado nas jornadas. Os bytes de trabalho ficam em `.data/validacao/assets/`, com hashes no manifesto. O arquivo `.pjc` é texto identificado como demonstração para conferir armazenamento/download/reutilização; não é um cálculo real que possa ser aberto no PJe-Calc. Um PJC exportado válido exige um arquivo sintético fornecido/validado no PJe-Calc, sem processo real.

## Roteiro da apresentação

1. Entre como advogada. Consulte a proposta do pedido `VALIDACAO-01`, a pasta e a linha do tempo do `VALIDACAO-02` e a entrega do `VALIDACAO-03`, com PDF, parecer e amostra PJC disponíveis para download.
2. Ainda na pasta do `VALIDACAO-03`, abra o pedido separado `P-0001` e “Continuar checklist”. A origem e o PJC guardado aparecem; o cálculo entregue permanece preservado. O rascunho exige revisão das etapas e nova data-base antes de uma proposta própria.
3. Entre como André para mostrar a fila, os pedidos, os registros de acesso aos arquivos e a proposta `ORC-2026-900005`. Em “Ajustar orçamento”, o motivo é obrigatório; uma alteração cria outra versão e preserva a anterior no histórico.
4. Use `/demonstracao` para apresentar o checklist completo, a proposta, o aceite e o sinal simulados. Os casos do portal são fictícios e os provedores reais continuam desligados.

## Publicação e conferência

Publicar somente um commit já integrado à `main`, com check/build da fonte e pacote completos conferidos. Montagem local, sem acessar credenciais:

```sh
node scripts/preparar-pacote-vercel.mjs <SHA_COMPLETO_DA_MAIN> .data/publicacao-validacao
```

Exceção pontual autorizada pelo Fábio em 20/10/2026: usar a candidata `49737d9856e65a3a53f572ee550afab1070049c0` exclusivamente no projeto e domínio acima, somente com dados fictícios e com a pendência intermitente do PDF registrada. Essa decisão permite publicar a candidata sem integrar o PR à `main`; não aprova o CI, não altera as proteções nem se aplica a outras publicações. As evidências e o resultado efetivo ficam no `plan.md`.

O gerador inclui fontes e configuração da aplicação e recusa testes, caches e arquivos de ambiente. Produz `deployment-mcp.json` e manifesto de nomes/tamanhos/hashes no diretório ignorado. Não altera variável, domínio, DNS, Git ou serviço externo.

Antes de chamar `create_deployment`, reconferir a main remota, os IDs de projeto/equipe, as variáveis pelos metadados e o destino do banco. Publicar via MCP dedicado e aguardar READY. O código não pode ser enviado como diff nem como o pacote antigo da demonstração.

Depois: confirmar `/api/health` com SHA/região, abrir o login, percorrer as contas de advogado e calculista, proposta/PDF, pasta/linha do tempo, documentos privados e cenário de atualização. Baixar PDF/contrato na Lambda para verificar fontes e bytes. Conferir o outro cliente recusado e a persistência depois de recarregar. Registrar URL, deployment ID, fonte e evidências no plano. READY e página de login isoladamente não encerram a tarefa.

Para encerrar a validação fictícia, o Fábio remove `ANDRE_VALIDATION_MODE` e solicita novo deploy. O modo bloqueia fora do projeto, banco, domínio e ambiente esperados; não é uma configuração de operação comercial.

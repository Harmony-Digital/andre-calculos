# Operação — backup e restauração

Este manual orienta a conferência do backup e um ensaio de recuperação do Portal de Cálculos do André. Os resultados, pendências e autorizações de cada execução ficam no [plan.md](../plan.md). A existência deste procedimento não comprova que um backup está ativo ou foi restaurado.

As referências oficiais foram consultadas em 2026-10-11. Antes de uma operação externa, reconferir o recurso e as condições exibidas na conta do cliente. As regras de [AGENTS.md](../AGENTS.md), especialmente contas, segredos e documentos sigilosos, continuam valendo.

## Responsáveis e destinos

| Responsável | Ação |
| --- | --- |
| Fábio | Aprovar custos, criação do destino, acesso técnico, restauração e qualquer mudança de produção. Configurar segredos de produção pelos meios humanos autorizados. |
| André | Aprovar retenção, uso dos documentos no ensaio e conferir o resultado de negócio. |
| Operador indicado pelo Fábio | Conferir as contas, executar somente a operação aprovada e registrar evidência sanitizada. |
| Agente | Preparar procedimentos e verificações; executar uma ação externa somente com escopo, conta e destino autorizados e conferidos. |

A origem esperada é o Supabase Cloud do cliente, projeto `qtofwbxujshroaafxowr`, URL `https://qtofwbxujshroaafxowr.supabase.co`. Usar o MCP dedicado `andre-calculos-supabase`; sua primeira chamada é `get_project_url`. A organização deve ser confirmada na conta do cliente: o campo correspondente em [contas-esperadas.env](../scripts/contas-esperadas.env) não define hoje seu nome.

O destino do ensaio será outro projeto, isolado e explicitamente aprovado. Registrar sua referência e organização antes de operar. O acesso do MCP da origem não autoriza acesso ao destino: é necessária conexão própria com escopo conferido. Divergência de conta, organização, referência ou região interrompe a operação.

A aplicação usa a Vercel da equipe `Projeto Andre`, slug `projeto-andre1`, ID `team_4fdLDCsB0ROvP5ph50aFNvxm`, projeto `andre-calculos`, ID `prj_tdmzmC6utVU2fHPz0iVhroMD8NtI`. O ensaio não altera esse projeto nem suas variáveis de produção. Previews e automações também devem ser isolados da origem.

## Conferir o backup disponível

1. Entrar na conta do cliente e conferir a referência da origem na tela. Não iniciar login com conta de outro cliente.
2. Abrir [Database → Backups da origem](https://supabase.com/dashboard/project/qtofwbxujshroaafxowr/database/backups/scheduled). Conferir o plano efetivo, modalidade de backup, último ponto recuperável, janela disponível e resultado da execução. Uma assinatura ou tela aberta não prova backup válido.
3. Registrar no plano apenas referência do projeto, modalidade, datas, resultado e responsável. Guardar capturas somente se não exibirem dados ou segredos.
4. Se a lista estiver vazia, houver falha ou a cobertura não atender à necessidade aprovada, registrar a ocorrência e encaminhar ao Fábio; não contratar adicional nem mudar a retenção automaticamente.

A documentação informa backup diário para planos pagos e sete dias de acesso aos backups diários no Pro. PITR tem contratação própria e substitui os backups diários. Conferir a modalidade efetiva em vez de presumir ambas. O backup do banco contém metadados do Storage, não os bytes dos arquivos. [Fonte oficial: Database Backups](https://supabase.com/docs/guides/platform/backups).

## Preparar o ensaio

Antes de iniciar, conferir a aprovação registrada do Fábio com origem, ponto de recuperação, destino, custos apresentados, operador e acesso permitido. Uma autorização recorrente pode cobrir vários ensaios dentro desses limites; reconferir sua validade e escopo em cada execução. Registrar também a autorização para utilizar dados reais, quando aplicável. Segredos, dumps e documentos não entram no Git, chat ou logs; eventuais arquivos sensíveis exigem destino privado aprovado fora do repositório.

Definir com os responsáveis quais dados devem existir no ponto escolhido e quais alterações posteriores precisam ser reaplicadas. Usar contagens, hashes e versões como evidência; manter identificadores de pessoas/processos e conteúdo em ambiente restrito. Não adotar o estado mais recente do código como prova da versão existente no backup.

Inventariar rotinas com efeitos externos: extensões, jobs do banco, webhooks, wrappers, Edge Functions, cron da Vercel, fila de avisos, pagamentos, e-mail e WhatsApp. Conferir inclusive dados de configuração e segredos internos recuperáveis. O inventário deve corresponder ao ponto recuperado, não apenas à origem atual: jobs removidos posteriormente podem reaparecer na cópia. Se esse inventário for desconhecido, o isolamento do clone físico não está comprovado. A cópia deve ser incapaz de cobrar ou contatar pessoas durante o ensaio.

## Escolher o método de restauração

### Restauração física em projeto novo

O recurso `Restore to a New Project` está em beta, exige plano pago e backups físicos. Copia o banco, inclusive dados de Auth; Storage, configurações de Auth/API e outros serviços exigem reconfiguração. O destino gera custos próprios. Abrir a [aba específica da origem](https://supabase.com/dashboard/project/qtofwbxujshroaafxowr/database/backups/restore-to-new-project), escolher o ponto aprovado e revisar o resumo antes da confirmação humana.

**Restrição:** extensões externas copiadas podem iniciar rotinas imediatamente após o restore; esse fluxo não permite pausá-las previamente. Se for necessário inspecionar/remover tais rotinas antes de executarem, utilizar o método lógico abaixo. Não usar “desligar depois” como garantia de isolamento. [Fonte oficial: Restore to a new project](https://supabase.com/docs/guides/platform/clone-project).

### Restauração lógica controlada

O procedimento oficial separa papéis, estrutura e dados; também exige atenção ao histórico de migrations, alterações em Auth/Storage, publicações e senhas de papéis próprios. A transferência da chave raiz de criptografia é uma etapa separada quando necessária. [Fonte oficial: Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

O operador deve elaborar e revisar o roteiro específico antes de executar: versões compatíveis, projeto destino vazio, arquivos privados autorizados, ordem de importação e remoção/desativação prévia dos efeitos externos. A restauração deve parar no primeiro erro; não ignorar permissões nem apagar políticas para fazê-la passar. Não copiar comandos com senha/URL de conexão para o terminal compartilhado, histórico ou evidência.

Sem roteiro revisado que impeça efeitos externos, o ensaio não começa. Usar backup lógico já existente do ponto aprovado quando disponível; um dump novo não recupera automaticamente um estado antigo. Não presumir que backup físico pode ser baixado ou convertido diretamente em SQL.

Os dois métodos recuperam o banco. Recuperar o serviço completo exige conferir os itens abaixo e a cópia de arquivos de M3.22. Não restaurar sobre a origem durante um ensaio.

## Conferir o destino recuperado

| Área | Evidência necessária |
| --- | --- |
| Identidade e isolamento | Referência/organização/região aprovadas; conexões da aplicação e automações apontam somente ao destino; origem preservada. Nenhum efeito externo ocorrido. |
| Banco | Objetos, contagens, vínculos e versões compatíveis com o ponto escolhido; migrations reconciliadas sem reaplicação cega; ausência de erro de importação. |
| Permissões | RLS, políticas, grants, papéis e RPCs conferidos. Clientes distintos não acessam os mesmos processos; funções internas permanecem restritas. Advisors de segurança/desempenho executados no destino e achados registrados. |
| Auth | Configurações, redirects e credenciais do destino conferidos pelo responsável; login real autorizado dos papéis cliente/calculista/admin e acesso negado no papel indevido. Senhas de pessoas não passam pelo agente. |
| Storage | Buckets privados, políticas e limites conferidos; arquivo/versão/tamanho/hash reconciliados com manifesto aprovado e ponto do banco. Bytes ausentes impedem declarar recuperação completa. |
| Aplicação | SHA da versão usada confirmado no deploy e em `/api/health`; cadastro/login, orçamento/proposta, aceite, sinal, pasta, linha do tempo e entrega/download percorridos em 375 e 1440 px, conforme o escopo liberado. `status: ok` isolado não prova acesso ao banco. |
| Idempotência | Recibos, reservas e chaves recuperados; aviso/pagamento com resultado incerto não é reenviado. Reconciliar o efeito já ocorrido no provedor antes de liberar processamento. |
| Privacidade | Reaplicar exclusões/restrições aprovadas posteriores ao ponto recuperado; conferir acesso histórico e retenção sem ressuscitar dados proibidos. |

Começar por verificações de leitura. Os scripts `dev-env.sh`, seeds e suites de banco/e2e deste repositório usam fixtures locais e podem modificar dados: não os apontar para uma cópia com dados reais como se fossem verificadores somente de leitura. Preparar casos exclusivos e aprovados para o ensaio externo.

O Fábio provisiona as credenciais técnicas do destino conforme as regras do cofre e configura as variáveis autorizadas. Agentes não leem senhas/chaves de produção nem gravam segredos em arquivos. Mudanças de autenticação e grants exigem aprovação específica; não reutilizar secret da origem por conveniência.

## Arquivos e recuperação completa

A cópia dos objetos do Storage pertence a M3.22: destino externo privado do cliente, custos/retenção aprovados, manifesto por arquivo/versão/tamanho/hash e recuperação de uma cópia interrompida. Esse manifesto deve corresponder ao ponto restaurado do banco.

Conferir conteúdo por hash e testar download autorizado e negado por cliente. Não circular documentos por WhatsApp, exportá-los para uma pasta pública ou armazenar URL assinada em evidências. Metadados recuperados com arquivo ausente não satisfazem a entrega do processo.

## Rotina mensal e tratamento de falha

Executar mensalmente o ensaio de restauração previsto no PRD, com destino, orçamento e acesso aprovados para cada execução. Escolher ponto e amostra autorizados, registrar início/fim, tempo medido, perda de dados constatada e resultados da matriz acima. O tempo observado não estabelece sozinho uma garantia de recuperação.

Se uma verificação falhar, manter a cópia isolada, preservar evidência mínima, registrar a falha no plano e corrigir antes de repetir a etapa afetada. Não promover o destino nem reativar cron, avisos, cobranças ou integrações automaticamente.

Uma recuperação comercial exige decisão específica do Fábio para a mudança de destino da aplicação, nova verificação de contas e plano de retorno. A validação do André e os GATEs continuam decisões humanas. Encerrado o ensaio, o responsável define retenção e descarte seguro da cópia; excluir projeto ou backup exige autorização própria.

## Registro mínimo no plano

Registrar data/hora no fuso America/Sao_Paulo, operador, autorização, origem/destino, método, ponto recuperado, versão/SHA da aplicação, hashes do manifesto e resultados por área. Incluir duração, divergências, correções, efeitos externos observados e decisão humana sobre promoção ou descarte. Evidências não contêm dumps, valores de ambiente, tokens, URLs assinadas, conteúdo de documentos ou dados pessoais.

Marcar M1.52 somente após a conferência real do backup e dos critérios de sua especificação. A entrega documental de M1.52a não marca restauração executada, proteção do Storage, M3.22 ou GATE. As fontes técnicas orientam o método; o plano e as autorizações definem a operação permitida.

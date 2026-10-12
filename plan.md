# Plano — Portal de Cálculos Judiciais do André

Nome provisório até a marca (D3).
- **Requisitos e stack:** `PRD.md`.
- **Regras de trabalho dos agentes:** `AGENTS.md`.
- **Passo a passo das tarefas:** seção "Especificação das tarefas", para o M1 e o M2. Os marcos seguintes são detalhados na tarefa `.00` de cada um, antes de começar.

## Onde estamos

- **Atualizado em:** 2026-10-12, por Codex.
- **Última retomada de M2.34d:** concluída. Fábio confirmou nova autorização somente Projeto Andre/andre-calculos; OAuth terminou com sucesso e MCP dedicado confirmou equipe/ID, list_projects com somente o projeto e list_deployments acessível. Publicação por create_deployment com os 158 arquivos da main 9a25f31. Deploy final dpl_D8FCmhRtUpTP4mftZr7RfbW6jeZ7 READY em gru1; endereço público https://project-rucji.vercel.app/demonstracao. Quatro testes hospedados aprovados em 375/1440 px, axe sem violações, proposta/aceite/sinal/documento/fila/timeline/entrega/download/reinício simulados. Evidência: docs/evidencias/demonstracao/README.md e hospedada/.
- **Demonstração autorizada pelo Fábio em 2026-10-11:** usar domínio original `.vercel.app` até a validação final; marca, nome, CRC, preços e calendário fictícios. Construir a visão do advogado, solicitação de orçamento, proposta discriminada e linha do tempo. A autorização vale para a apresentação fictícia; decisões comerciais definitivas e domínio próprio continuam abertos.
- **Retomada da construção integral:** M2.19a concluída: comandos reais de análise/cálculo/revisão, espera e retorno à origem. CI38162207294 aprovado com 358 unitários, doze testes de scripts, build, 160 testes reais de banco, 117 e2e/sete omissões e advisors sem achados; seis e2e próprios em 375/1440 px e quatorze capturas inspecionadas localmente. PR #3 com fonte verificada. M2.04a concluída com CI38163619398 integralmente aprovado na fonte 2cab40d (184 banco, 117 e2e/sete omissões e advisors sem achados); PR #4 pronto para revisão e dependente de #3. M2.04b concluída localmente e no npm run check/build remoto: tipos/CPF/CNPJ/celular e campos obrigatórios protegidos no hook; 282 banco, seis e2e/duas omissões, 362 unitários/doze scripts e advisors sem achados. Fonte 4af6407/PR #5 pronto para revisão; CI38164584726 completo aprovado com 282 banco e 117 e2e/sete omissões. CI38163315728 do PR #3 concluído com sucesso. M2.12a implementada e validada localmente: 315 banco, 379 unitários, quatro e2e próprios e doze regressões de aceite/jornada em 375/1440 px; advisors sem achados. Fonte 5173391 aprovada no CI38166216291 completo: 315 banco, 121 e2e/sete omissões e advisors sem achados; PR #6 pronto para revisão. A demonstração publicada continua sendo a versão da main; novas operações não foram publicadas.
- **Fase:** M1/M2 com implementação local verificada e demonstração publicada; operação comercial ainda depende dos insumos e GATEs humanos. M3 detalhado e aprovado para implementação local fictícia; condições externas próprias permanecem.
- **Aprovação de M3.00:** Fábio aprovou em 2026-10-11 o detalhamento apresentado na fonte b9b687d e autorizou continuar a implementação local com dados fictícios. O alcance conserva as condições de contas, custos, decisões do André, publicação e operações reais; não aprova GATEs. M2.28e concluída no preparo/verificação local, com correção confirmada no CI; M3.01d/e/f e M3.01a concluídas no preparo/verificação local; M3.01g concluída no preparo/verificação local; M3.01l concluída no preparo/verificação local; M3.01m e M3.01h concluídas no preparo/verificação local e CI integral aprovado. M3.01n concluída no preparo/verificação local e CI integral aprovado. M3.01o concluída no preparo/verificação local e CI integral aprovado; M3.01p desdobrada antes do código em q/r/s; q concluída no preparo/verificação local e CI integral aprovado. M3.01r concluída no preparo/verificação local e CI integral aprovado. M3.01s e parentP/I concluídas no preparo/verificação local e CI integral aprovado. M3.01t concluída no preparo/verificação local e CI integral aprovado. M3.01u desdobrada antes do código em w/x; w/y concluídas no preparo/verificação local, com check/build das fontes finais aprovados no CI; x desdobrada em y/z/aa;y/z completas no preparo/verificação local;aa concluída comad/ae no preparo/verificação local;X/U concluídas no mesmo recorte com regressão local geral/check-build final confirmado. J conserva V aberta. M3.01b/M3.01 e ativação externa permanecem abertas.
- **O que já existe:**
  - documentação organizada em `docs/`, Next.js 16.4/React 19.3 em `app/`, página pública, áreas provisórias do cliente e André, checklist de nove etapas e rascunhos legais;
  - motor de orçamento em centavos, calendário processual provisório, classificador e máquina de estados; 1.321 testes unitários em 65 arquivos aprovados no preparo atual; build da fonte nova ainda depende do CI;
  - sessão SSR com cookies HttpOnly, login/logout, papéis protegidos e pasta de documentos; navegador/axe verificados em 375 e 1440 px;
  - 91 migrations somente locais, 25 tabelas públicas e 55 internas, todas com RLS; quatro usuários fictícios e um processo inventado. CI37 da fonte81b7026 aprovou 836 testes reais de banco em40 arquivos;cinco testes novos da projeção pública passaram localmente. Read-back final do simulador preserva os metadados, donos, grants anteriores e controles financeiros do baseline90, com tabela ativa ausente/identificação restaurada e dois advisors sem achados;
  - upload TUS de 300 MiB retomado do offset de 12 MiB após interrupção da rede; SHA-256 conferido no servidor; download auditado por link de 120 s e acesso entre clientes negado;
  - pasta do processo com seis abas, quatro pastas fixas e PDF sob demanda; paginação, zoom, texto selecionável, senha efêmera e rolagem por teclado; proxy privado com HEAD/Range/206 auditado, leitura de PDF acima de 4,5 MB verificada localmente, sem URL assinada no navegador durante a visualização;
  - mensagens privadas entre cliente e calculista, anexos confirmados da pasta do cliente, nomes dos participantes, histórico paginado sem perda de microssegundos; envio idempotente e texto preservado após falha, inclusive resposta perdida depois de gravar; avisos enfileirados, sem despacho real;
  - linha do tempo com filtro antes do limite, paginação por data/UUID e notas compartilhadas com o cliente; só o calculista registra notas, com autoria inferida da sessão, idempotência e auditoria; helper interno mantém evento na mesma transação dos casos de uso;
  - decisões técnicas registradas pelo calculista com origem/página/justificativa, premissas e concordância exclusiva do cliente; registro imutável, confirmação idempotente, eventos/auditoria transacionais e PDF privado com CRC, fontes locais e paginação; ensaios em 375/1440 px e PDFs de uma/seis páginas conferidos;
  - índice de páginas por arquivo/versão com criação/edição/remoção pelo calculista, leitura do cliente, revisão otimista e recibos privados para reenvio seguro; paginação com microssegundos/UUID, fonte preservada e nova versão sem herança automática de referências;
  - fila do André ordenada pelo prazo interno/UUID, com filtro antes do limite, prazos ausentes ao final e paginação de cinquenta; destaques de atraso/dois dias úteis pelo calendário provisório e situação financeira só por pagamentos confirmados;
  - visão geral com seis contagens exatas, cinco próximos trabalhos e links para clientes/propostas/pagamentos/fila/prazos; filtros antes da paginação, 116 atrasados e 61 propostas percorridos sem perdas, acesso operacional exclusivo do calculista e entrada administrativa só para configurações;
  - entrega conferida com PDF/PJC/parecer, complementos DOCX/XLSX e checklist explícito; confirmação transacional/idempotente, arquivos/identificação congelados, evento/auditoria e aviso enfileirado; resumo paginado sem perda de microssegundos, cliente sem bytes até política/saldo permitirem, sem decisão real de D6;
  - aprovação explícita/auditada pelo calculista da regra para entregas futuras ou individualmente para entregas antigas sem regra, com revisão concorrente e recibos imutáveis; saldo/Pix restritos ao processo, uma obrigação por pedido na página, pagamento parcial e estorno considerados, escolha real de D6 ainda pendente;
  - checklist v1 persistido como rascunho, retomado após recarga e pela lista; revisões concorrentes protegidas e outro cliente recebe 404; nenhum orçamento ou entrada na fila antes das condições comerciais;
  - configurações profissionais/comerciais auditadas, versões de preço e itens imutáveis após ativação, edição concorrente recusada; projeção pública sem Pix; limites do classificador vêm das configurações; erro de validação preserva valores, escolha de ativação e confirmação, e cada nova ativação exige confirmação desmarcada inicialmente;
  - preferências do responsável pelos avisos para nove eventos e dois canais; e-mail ligado/WhatsApp desligado por padrão, vínculo persistente, revisão concorrente e recibos imutáveis; falha de rede antes/depois da gravação preserva a tentativa, reenvio antigo não desfaz escolha mais recente; novos avisos respeitam a preferência, sem cancelar pendentes nem recuperar ocorrências anteriores;
  - lembretes de um/dois dias úteis e atraso preparados localmente; janela independente de 07h até antes de 21h, recibos privados por pedido/evento/prazo e cancelamento de pendentes obsoletos; 205 pedidos fictícios percorridos no banco local sem duplicação no replay; cron exige Bearer e não aceita relógio HTTP, calendário provisório bloqueia nuvem e nenhum cron/envio real foi ativado;
  - proposta fictícia do checklist com número anual transacional, itens/total/sinal/saldo, snapshot imutável e PDF privado; replay funciona após perda de resposta e mudança de configurações; ensaio de seis serviços e quatro mil caracteres renderizado em três páginas, com CRC/rodapés/textos conferidos; emissão comercial bloqueada até calendário, período e disponibilidade confirmados;
  - aviso quote_created transacional por proposta não simulada, respeitando vínculo/papel/contatos e preferências; deduplicação por canal, concorrência com edição de preferências e rollback do segundo canal verificados; nenhum aviso para simulações e nenhum despacho externo;
  - aceite eletrônico preparado com proposta/termos integrais em contexto privado, versões/hashes e recibo imutável com usuário/data/origem HTTP; concorrência, replay após perda de resposta, validade durante locks, rollback e acesso entre clientes conferidos; contrato sem documento fica aguardando envio e o primeiro upload confirmado libera a fila atomicamente; confirmação de upload recupera resposta perdida, e o painel conserva links e motivos de bloqueio; positivos usam contextos sintéticos exclusivos, sem habilitar contratação na simulação;
  - sinal manual preparado com instruções Pix privadas na pasta, valor restante derivado da proposta aceita, recibos/UUIDs imutáveis e confirmação exclusiva do calculista; parcelas/estornos preservados, reenvio sem duplicação, pagamento antes/depois do documento e aviso de fila transacional com data de entrega; treze regressões de banco e quatorze e2e de sinal/aceite conferidos em 375/1440 px; uso comercial depende de dados reais e produtor aprovado;
  - condição de cliente com contrato cadastrada no painel com motivo, revisão concorrente e histórico privado; dispensa sinal antes/depois do aceite, exige documento confirmado e preserva pagamentos/recibos; retirada bloqueada durante trabalho ativo, replay e rollback atômicos; quinze testes de banco e seis e2e próprios aprovados, com upload real e quatro capturas inspecionadas; vínculo do pagamento imutável também para parcelas legadas/pendentes;
  - cadastro confirmado no Mailpit com versões legais sintéticas, perfil persistido, troca de senha com revogação no segundo dispositivo, exclusão solicitada sem apagar conta e aviso de cadastro enfileirado;
  - `npm run check` aprovado (340 unitários/build), 109 e2e da suíte completa aprovados e sete ensaios únicos omitidos apenas no projeto celular; jornada do cadastro ao download repetida em 375/1440 px após correção dos controles cortados do checklist; 142 testes de banco aprovados e advisors locais de segurança/desempenho sem achados;
  - jornada única com cliente e André em contextos independentes, axe nas dez páginas principais por largura, sinal/upload/fila/decisão/entrega/download e limpeza verificados; três preparações sintéticas explícitas (contexto contratual, revisão técnica e saldo) conservam os bloqueios comerciais; CI remoto 38142154491 aprovado: 340 unitários, doze testes de scripts, build, 142 testes de banco, 109 e2e e advisors locais sem achados; PR #1 integrado em f0f900740ed60cb5cd655ce414b8b342ea35b0d9. Evidência: docs/evidencias/git/ci.md;
  - Docker/Colima exclusivos de `andre-calculos`, sem alterar o contexto global; Supabase local PostgreSQL 17 com serviços saudáveis e Auth health HTTP 200;
  - branch de trabalho `feat/fundacao-portal`; primeiro push da `main` em `Harmony-Digital/andre-calculos` confirmado no SHA `cc34885848e694887e7da7be626e87d2e037118a`, com clone remoto independente de 25 commits sem áudio;
  - conta Vercel `projetoandre.harmony@gmail.com` conferida no navegador; consentimento concedido somente à equipe `Projeto Andre`, com acesso a todos os projetos atuais/futuros desmarcado. MCP dedicado validado para a equipe: `list_teams`/`get_team` confirmaram `projeto-andre1`/`team_4fdLDCsB0ROvP5ph50aFNvxm`; o painel criou `andre-calculos` (`prj_tdmzmC6utVU2fHPz0iVhroMD8NtI`), com Next.js, Node 22 e raiz vazia para o pacote. MCP renovado e validado: somente este projeto aparece e seus deploys podem ser consultados;
  - demonstração fictícia Marco em `/demonstracao`, com entrada do advogado, nove etapas do checklist, proposta discriminada, aceite/sinal/documento simulados, linha do tempo, visão do calculista, calendário e mensagens locais; CI 38153083358 aprovado com 348 unitários, doze testes de scripts, 142 RLS, 113 e2e/sete omissões e advisors sem achados. PR #2 integrado normalmente na main em `9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd`; pacote de 158 arquivos comparado byte a byte com essa fonte. Evidência: docs/evidencias/demonstracao/README.md;
  - MCP `andre-calculos-supabase` validado por chamada real `get_project_url`, retornando `https://qtofwbxujshroaafxowr.supabase.co`; ambos os MCPs agora disponíveis diretamente no chat e identidade conferida por chamadas nativas, após ensaio separado pelo cliente oficial Codex CLI/App Server. Evidência: `docs/evidencias/mcp/validacao-2026-10-11.md`;
  - áudio removido de 24 commits e duas árvores de snapshot Git com autorização do Fábio, mantendo autores/mensagens/datas/arquivos restantes e o original local íntegro; nenhuma referência alcança o blob do áudio. Evidência: `docs/evidencias/git/retirada-audio.md`;
  - primeira execução GitHub Actions criou os jobs `qualidade` e `e2e`, mas a conta recusou ambos por cobrança/limite antes de qualquer etapa; proteção de main recusada por exigir upgrade no repositório privado;
  - preparação de M1.23 concluída com doze testes fictícios de destino, transporte de valores e falha parcial; script exclusivo do Fábio e metadados obrigatórios impedem qualquer uso atual em produção; o build local foi recusado pelo ambiente ao abrir porta interna do Turbopack; o mesmo código passou no npm run check/build do CI remoto;
  - transcrição retirada das referências de 27 commits e duas árvores locais, com original íntegro; remoto antigo saneado e arquivado privado, novo repositório independente público no mesmo endereço (ID 1414349093); clone de 25 commits sem áudio/transcrição e consultas anônimas dos conteúdos antigos HTTP 404; proteção de main aplicada e conferida, CI do PR #1 aprovado e integrado. Evidência: docs/evidencias/git/retirada-transcricao.md. Caches antigos não foram purgados fisicamente e ficam restritos ao arquivo privado.
- **Próximas tarefas do agente:** executar a construção integral solicitada pelo Fábio. M2.28a concluída com 16 modelos de e-mail, 24 testes específicos e 32 ensaios de navegador/axe em 375/1440 px aprovados; QA visual das 32 capturas sem cortes ou sobreposições. npm run check/build remoto aprovado na fonte d065be6 com 403 unitários/doze scripts; CI38168299312 completo aprovado com 315 banco, 153 e2e/sete omissões e advisors sem achados; PR #7 pronto para revisão. M2.35a com coleta parcial real: qualidade/build do CI38169457310 aprovados na fonte b1a201f (403 unitários/22 scripts), artefato com 35 traces/300 JS e hashes conferidos; zero referências/marcadores identificáveis dos cinco pacotes, mas um symlink não resolvido mantém cobertura incompleta. CI38169457310 completo aprovado (315 banco, 153 e2e/sete omissões, advisors sem achados); PR #8 pronto para revisão na fonte b1a201f. Diagnóstico sanitizado aprovado na nova fonte03b4d77/CI38170815863 (411 unitários/25 scripts/build): artefato symlink ignorado em .next/node_modules/@react-pdf/renderer, sem seguir alvo, cobertura incompleta preservada. Advisory e revisão integral abertos. PR #6 concluiu CI38166216291 com sucesso e está pronto para revisão; PRs #3/#4/#5 também verificados. M2.28d concluída no preparo local: três modelos nativos de autenticação, oito testes próprios/411 unitários/25 scripts e 38 e2e aprovados; seis capturas com QA independente, npm run check/build remoto da fonte03b4d77 aprovado no job114562860596/CI38170815863. CI38170815863 completo aprovado: 315 banco/159 e2e/sete omissões e advisors sem achados; PR #9 pronto para revisão na fonte03b4d77. SMTP/configuração/Auth real continuam pendentes. M2.04c implementada localmente: aviso de link inválido, callback com origem pública configurada e validação HTTP/HTTPS; sete unitários próprios/418 totais/25 scripts e 18 e2e/duas omissões planejadas aprovados, inclusive retorno automático sem navegação corretiva. QA visual independente e npm run check/build remoto da fonte9843f5d aprovados no job114565777210/CI38171804330. CI38171804330 completo aprovado: 315 banco/165 e2e/sete omissões e advisors sem achados; PR #10 pronto para revisão na fonte9843f5d. Fontes remotas preservadas. M2.04c concluída no preparo/verificação local. M3.00 contém 32 especificações, com pagamento dividido em M3.01a/b/c e reaproveitamento de M2.23 em M3.12; aprovação do Fábio registrada para implementação local fictícia. Para operação comercial, M1.50 requer integração GitHub/Vercel, M2.28b/c requerem conta/credenciais/envio autorizado e M2.35 requer a skill security-review ausente. Achado preexistente do npm audit registrado em M2.35a, sem correção oficial no advisory; audit omitindo dev retornou zero, sem comprovar o bundle. Priorizar MCP conforme ordem do Fábio; endereço temporário confirmado em scripts/contas-esperadas.env e AGENTS.md §7.
- **Fila local verificada (M1.51a):** reservas/replay, conteúdo congelado, cinco tentativas e espera crescente; resultado incerto bloqueado sem reenvio. 434 unitários/25 scripts/check/build remoto aprovados na fonte558a5c7/job114571144088/CI38173586727, 340 banco/25 próprios locais e advisors sem achados. CI38173586727 completo aprovado: 340 banco/165 e2e/sete omissões planejadas e advisors sem achados; PR #11 pronto para revisão, fonte remota preservada. Executor fictício M1.51b preparado/verificado; ativação externa M1.51c e M1.51 integral permanecem abertas.
- **Executor local (M1.51b):** preparação concluída: migration0055, runIds/slots imutáveis, getters sem efeitos e aceitação fictícia única/retomável. 30 próprios/370 banco gerais, 43 unitários dos módulos/461 gerais/25 scripts, advisors/revisões aprovados. npm run check/build remoto da fonte85568bcd004d387ab216bba5c23a95fbef52962e aprovado no job114574690764/CI38174754842; CI38174754842 completo aprovado: 370 banco/22 arquivos, 165 e2e/sete omissões planejadas e advisors sem achados; checkout447f99c42e34abff17f54ec1b7e98f455d645cf3 conferido. PR #12 pronto para revisão, fonte preservada. Read-back local zero execuções/chamadas/aceites/reservas/recibos/triggers das fixtures. Ativação externa/infraestrutura continuam pendentes; M3.00 aprovado pelo Fábio para implementação local fictícia.
- **Inventário de build (M2.35b):** concluído no recorte técnico: fonte62c8def/PR #13, npm run check/build remoto aprovado no CI38175897388/job114578103904 (461 unitários/43 scripts). JSON real sanitizado conferido contra fonte/checkout/lock/configuração: 35 traces/301 JS e quatro JS do alias PDF, contadores de incompletude zero. Relatório preservado byte a byte com hash em docs/evidencias/seguranca/. Revisões independentes sem bloqueador. CI38175897388 completo aprovado: 370 banco/22 arquivos, 165 e2e/sete omissões planejadas e advisors sem achados; checkout73bb11cfc5ddf2c79d814520af5e90924cc03a68/pais conferidos. PR #13 pronto para revisão e fonte preservada. M2.35a/advisory e revisão integral permanecem abertos.
- **Manual de operação (M1.52a):** preparo documental concluído na fonte79fc356c8c56579cc4375214d2f2275504cef7b3/PR #14, npm run check/build remoto aprovado no CI38176671146/job114580408182 (461 unitários/44 arquivos e 43 scripts), checkoute1e04c702bd6f2eab96b0d8992bd17f0ce95935d/pais conferidos. CI38176671146 completo aprovado: 370 banco/22 arquivos, 165 e2e/sete omissões planejadas e advisors sem achados. PR #14 pronto para revisão com fonte preservada. docs/operacao.md, com fontes oficiais atuais, oito links conferidos e revisões independentes. Explica backup/restore, responsáveis, ponto recuperado, método físico/lógico, isolamento, teste mensal, RLS/Auth/aplicação e limites do Storage. M1.52 continua dependente de M1.05 e confirmação real no painel; nenhuma restauração, contratação ou alteração de produção executada.
- **Aviso de sinal ao cliente (M2.28e):** concluído no preparo/verificação local. Fonte5d3db8a1f63758e0a619605052f30e60e3af1153/PR #15, check/build CI38178835637/job114586864386 aprovado (461 unitários/44 arquivos e43 scripts), checkout8d74e4e2f6132189589b192264286b4ef1a2b65a/pais conferidos. Fixture de perfil mínimo corrigida com telefone fictício e restauração original; 27 testes locais próprios/regressões passaram, etapa geral de banco remoto success às22:08:30UTC. CI38178835637 completo success: 384 banco/23 arquivos, 165 e2e/sete omissões planejadas e advisors sem achados. Checkout8d74e4e2f6132189589b192264286b4ef1a2b65a/pais/head conferidos; fonte preservada. Sem despacho externo; próxima M3.01a aprovada. Evidência: docs/evidencias/notificacoes/sinal/README.md.
- **Contratos Asaas (M3.01d, parte de M3.01a):** concluídos no preparo/verificação local: fontea2cb04a87e23ae85581d2eb7f42881dfc24b7dae/PR #16, check/build CI38180969695/job114593253417 aprovado com596 unitários/47 arquivos e43 scripts; checkout0cb19ffdc2b7798582467a06d9629d637cc16d71/pais conferidos. Quatro módulos somente servidor/135 próprios e revisões sem bloqueador. JSON preciso, centavosBigInt, clientes/obrigações/escopos e fatos separados, sem efeitos. CI38180969695 completo success: 384 banco/23 arquivos,165 navegador/sete omissões planejadas e advisors sem achados; checkout/pais/head conferidos. PR #16 pronto para revisão/fonte preservada. M3.01a preparada/verificada localmente nas três partes; ativação externa permanece pendente.
- **Porta Asaas (M3.01e):** concluída no preparo/verificação local: fonte58f61cf291295672e8fa5c75d0cd1fa4b35a6893/PR #17, check/build CI38182349916/job114597378029 aprovado com732 unitários/49 arquivos e43 scripts; checkout3d803ab3b5083348dc2dad0f7cbe8be19ff4ac25/pais conferidos. Fixture declarada, JSON exato, cliente/notificações/meio/vencimento, busca de unicidade e fatura privada;136 casos novos e duas revisões sem bloqueador. CI38182349916 completo success: 384 banco/23 arquivos,165 navegador/sete omissões planejadas e advisors sem achados; checkout/pais/head conferidos. PR #17 pronto para revisão, fonte preservada. Sem driver/segredo/HTTP/banco/efeito financeiro. M3.01f e parentM3.01a preparados/verificados localmente; próxima M3.01b.
- **Eventos Asaas (M3.01f):** concluídos no preparo/verificação local: fonte3dabd4dd888749f2dd0398fc2af0e85d5266083f/PR #18, check/build CI38183836577/job114601844053 aprovado com878 unitários/50 arquivos e43 scripts; checkout52650030f80793a5a4291af4504a3c5577dab10d/pais conferidos. 146 próprios/presença/fatos/reconciliação/comparação cumulativa semdelta/efeitos; duas revisões finais sem bloqueador. Suíte recuperada e fonte final revalidada. CI38183836577 integralmente success:384 banco/23 arquivos,165 navegador/sete omissões planejadas e dois advisors sem achados; checkout/pais/head conferidos, extrato0410e60d9a84cf78aa5e8a9b0bfdac1cfa41742c0bc9209d9118030b62b1b528. PR #18 pronto para revisão, fonte preservada. M3.01a preparada/verificada integralmente no recorte local,414 casos próprios; autenticidade/suporte real/ativação de M3.01c continuam pendentes. Próxima M3.01b.
- **Obrigações (M3.01g):** concluídas no preparo/verificação local: migration0058 privada/RLS, conta e cliente fixture, sinal/saldo pelo aceite e crédito manual preservado; contrato vigente, fase, valores seguros, replay e autoria. 50 unitários e19 banco próprios/403 gerais locais, advisors sem achados e duas revisões. Check/build remoto CI38185910157/job114608059274 success na fonte86895f48d911c1f6365ca3a0461aaff6cb4e4c33/PR #19, com928 unitários/51 arquivos e43 scripts. Checkoutc241483a3db6cd7386b54d8d2d0045d104e52bec/pais main9a25+fonte conferidos, extratoc6cc3c41e8c37e5b79dc3274457a1297e9704cacd24d1228f2f872a36df2615e. CI38185910157 integralmente success:403 banco/24 arquivos,165 navegador/sete omissões planejadas e dois advisors sem achados; checkout/pais/head conferidos, extrato5081b8ebd1052dd0c2d11975dfd3c906b5d2db05eeb969aaf0339de734e1b5d7. PR #19 pronto para revisão, fonte preservada. Read-back local: zero scopes/bindings/contextos/configuração e quatro perfis. Nenhuma emissão/crédito/fila/download alterados. ParentM3.01b e h/i/j/k abertos; próxima l, parte de h.
- **Reservas (M3.01l):** concluídas no preparo/verificação local: migration0059 privada/RLS, referência UUID, exclusividade por pedido, fingerprints/replay, retirada préclaim e estado atual separado de recibo.43 unitários e24 banco próprios/427 gerais em25 arquivos, advisors e duas revisões sem bloqueador. Check/build CI38187868946/job114614038683 success na fonte7daef30d5d1f341f08cc0717074961559f433f18/PR #20,971 unitários/52 arquivos e43 scripts; checkout49f87d56dec923aa904a2f296946c0e0aa87aa7b/pais main9a25+fonte conferidos, extratodac71b90476689e651e8a9056d58bae25f13a7f02ab4ba3b79289d1bfcfbf44d. Suíte geral remota viva/PR rascunho/head preservado; sem declaração de CI integral. Read-back zero intenções/reservas/requests/claims/retiradas/contextos/scopes/bindings/configuração e quatro perfis. H/parentb abertos; próxima m, que coordena Pix/contrato. Sem escritor de claim/POST/crédito.
- **Observações financeiras (M3.01t):** preparadas/verificadas localmente na fonte 4559f4de9dde80f928179c66eabfa177de161c48/PR #27. Identidade capturada R/N, journal imutável, conflitos duráveis, consultas com protocolos/revisão/fencing independentes e prova fictícia de chargeback. 30 testes próprios e621 gerais de banco/32 arquivos aprovados; 1138 unitários/59 arquivos e43 scripts. Check/build CI38201931012/job114657020221 success; checkout 5d0abd258b1744db00a58b11045f12439d9eb404/pais main9a25+fonte conferidos, extrato25dc2622a5ba9f05e66ac53c8f7e023af978fcae972fa13eb27c56619d77fde1. CI38201931012 integralmente success:621 banco/32 arquivos,167 navegador/sete omissões planejadas e dois advisors sem achados. Extrato remoto764e69e48b58cdee2b49f07902d59a5f86799bdd2524754ed4645742f2db4480; mesmo checkout/pais/head conferidos. PR #27 pronto para revisão, fonte preservada. Advisors locais sem achados após cada migration e no fim. Read-back:73 migrations,25 tabelas públicas/49 privadas com RLS,4 perfis, markerfalse e zero registros nos journals e demais metadados de pagamentos do ensaio. Evidência em docs/evidencias/observacoes-financeiras/README.md. Próxima U; J/V abertas, nenhum crédito ou consumidor alterado.
- **Bloqueios externos:**
  - administração da Vercel pelo navegador teve bloqueio registrado de Computer Use; isso não impede a demonstração concluída pelo MCP. Não repetir nem contornar essa proteção caso o navegador volte a ser necessário;
  - planos Pro, integração GitHub/Vercel, skill de segurança e dados reais do André ainda precisam de verificação/insumos;
  - CI e proteção do novo repositório público verificados; caches antigos continuam privados, sem purga física pelo suporte do GitHub. A integração Vercel deverá selecionar o novo repositório ID 1414349093;
  - GATEs, revisão de textos, calendário de TRT, preços e ensaios reais continuam sem evidência humana; não foram marcados como concluídos.
- **Prazo combinado com o André:** primeira versão no ar por volta de 2026-10-20 (M2).
- **Toda sessão começa pelo preflight de contas** (`scripts/preflight.sh`, `AGENTS.md` §7). Nesta execução foram confirmados GitHub `fabioalmeidadigital`, remoto e cofre exclusivo `proj-andre-calculos`.

- **Posição/projeção financeira (M3.01w):** concluída no preparo/verificação local na fonte303b47757364d2d98f441324547672d4d7115ca8/PR #28. Crédito cumulativo, taxa, parcial/excesso/incerteza, manual/legado sem dupla contagem; cobertura de T, UNKNOWN/conflitos e fonte antiga/replay protegidos. 51 unitários próprios/1189 gerais em60 arquivos e43 scripts;33 banco próprios/63 focados após0077 e653 gerais até0076. Advisors/read-back sem achados/dados residuais do ensaio,77 migrations/25 públicas/51 privadas comRLS,4 perfis e markerfalse; pagamento original do seed preservado. Check/build CI38205949733/job114669363566 success; checkouta1a7589ccebbe9a89500e0ddf25f841a9fe989fc/pais main9a25+fonte/head conferidos, extrato388b55e78fbeebd6667b83cd89c99fa640c63a93887c109ff2cbad0912f15493. CI38205949733 integralmente success:654 banco/33 arquivos,167 navegador/sete omissões planejadas e dois advisors sem achados; checkout/pais/head conferidos, extrato d703b0cd2b882c6f948993f34a318b1bc2bc3141451861d4912cf6afa04ed32a. PR #28 pronto para revisão, fonte preservada. Evidências em docs/evidencias/pagamentos/projecao-financeira/README.md. Próxima X (writer/efeitos/resolução), ainda necessária junto de V para fechar U/J; sem aplicação comercial ou nova publicação.

- **Aplicação financeira (M3.01y):** preparada/verificada localmente; writer fixo porIDs, três fences e locks, posição/recibo/auditoria/eventos/avisos/fila atômicos.36 banco próprios finais após0084;688 gerais/34 arquivos até0082;1195 unitários/60 arquivos e43 scripts.14 navegador375/1440 comAxe/capturas/QA; preferência/timeline repetidas aprovadas. Advisors após cada migration e nofim sem achados; read-back84 migrations/25 públicas/52 privadas comRLS,4 perfis/markerfalse, metadados do ensaio vazios e pagamento original do seed preservado (pending). Banco geral 4a4d11165a3a0711b63b5db45b82f1d06b21afc614bbd4764c5ab01e9746ab12; foco final 602c16ceac52a17d7c8d0176e4a1614f8b9de52b5cdfae23d4e8610909d388f2; read-back 19d1fd00870c5766b7ec09b2f63419b86de49958a362d450abdb9a5233d13611. Build local conserva EPERM de porta/Turbopack; check/build da fonte55164faa3a207e8abb98ead7da56365f63d53238 confirmado no CI38210168644/job114682336319 success:1195 unitários/60 arquivos,43 scripts,sete páginas. Checkoutc4a075e6ff06caf9cb1c3f729b3ed2cf1ce7ccda/pais main9a25+fonte/head conferidos,extrato025ff6d574afdba09b0500c754fd5c860246b94501117583e01b5a47697b7425. CI38210168644 integralmente success:690 banco/34 arquivos,179 navegador/sete omissões planejadas e dois advisors sem achados;checkout/pais/head conferidos,extrato01adbb88001efe4ef1ac0d803fad9bc7434c76b5566d22c1548a450e52d627f8. PR #29 pronto para revisão,fonte preservada. Evidências em docs/evidencias/pagamentos/aplicacao-financeira/README.md. Y concluída no preparo/verificação local; próxima Z. X/AA/U/J/V/parentb/M3.01 e condições externas continuam abertas. Sem cloud/publicação/operação real.

- **Guardas financeiras (M3.01ab):** concluídas no preparo/verificação local na fonteadbb50618a395a268e352e33ae14c7f1a49b122c/PR #30. SQL0085 protege manual/G/reserva/start/N pela projeção comum e locks;receipt concorrente relido sob advisory antes da guarda.27 próprios/46 focados e717 gerais de banco/35 arquivos aprovados;expectativas antigas de legado zero corrigidas para crédito desconhecido nulo. Advisors após0085 e nofim sem achados;read-back85 migrations/25 públicas/52 privadas comRLS,4 perfis/markerfalse,metadados do ensaio vazios e pagamento original12500/pending preservado. Check/build CI38213748801/job114693572820 success:1196 unitários/60 arquivos,43 scripts e sete páginas;checkout44c376c59014febbd3143a66a5be76d42809a105/pais main9a25+fonte/head conferidos,extrato3c214f58cb717e36464c7b5c0a10c6116566cedc329044f7c2404d86131bbcac. Banco geral 0d3d328615413abf57dc35b9244c72273af8deb51f6837344fdf3b3b5c42c08f;read-back 11b3f6c4df96924ba718052380293519625253f2951aeb7907f4a24f8dd705a5. Build local conserva EPERM/Turbopack. CI38213748801 integralmente success:717 banco/35 arquivos,179 navegador/sete omissões planejadas e dois advisors sem achados;mesmo checkout/pais/head conferidos,extratoeaf4086288d4530bfa68aa69ea63b8e6dfdb1a8a65ee8d03118e386c8d13aa0a. PR #30 pronto para revisão,fonte preservada. Evidências em docs/evidencias/pagamentos/guardas-financeiras/README.md. AC também concluída no preparo/verificação local;Z encerrada nesse recorte, próximaAA;X/AA/U/J/V/parentb/M3.01 e condições externas permanecem abertas. Não libera reserva nem resolve run.

- **Terminal financeiro (M3.01ac):** concluído no preparo/verificação local na fonte f6116075aa3b09e4bc9a90f94110789ce11c4aeb/PR #31. SQL0086/0087 locais;87 corrigiu referência do motivo detectada no ensaio, preservando escopo. Journal separado de S, captura corrente/candidato W/três fences, terminal/revisão/current_step e DELETE próprio/auditoria atômicos. Views atuais/retomada financeiras mantêm recibos históricos.30 próprios finais e747 gerais de banco/36 arquivos aprovados, incluindo claim antigo intacto, rollback, workers atrasados e refund/CB/UNKNOWN com reserva+claim posteriores. Advisors finais sem achados;read-back87 migrations/25 públicas/53 privadas comRLS,4 perfis/markerfalse,metadados do ensaio vazios e seed12500/pending preservado. Check/build CI38219444567/job114711884457 success:1237 unitários/61 arquivos,43 scripts,sete páginas;checkout fb03961c48cb5214b2511fbc54b3451ef98313c3/pais main9a25+fonte/head conferidos,extrato fd8cfd07837d411bcb527ba623d71bc5c54d3fc9d9738befbde07606270fbc6e. Build local conserva EPERM/Turbopack;CI38219444567 integralmente success:747 banco/36 arquivos,179 navegador/sete omissões planejadas,dois advisors sem achados;checkout/pais/head conferidos,extrato094b2513dfcfd3343c1a25cbbc642d25964c15a4ca1fcb985a30087b1180efa9. PR #31 pronto para revisão comhead preservado. Z concluída comAB/AC no preparo/verificação local. PróximaAA, desdobrada emAD/AE antes do código sem remover escopo;X/U/J/V/parentb/M3.01 e condições externas abertas. Evidências em docs/evidencias/pagamentos/resolucao-financeira/README.md;sem cloud/publicação/Asaas real.

- **Origem explícita do legado (M3.01ad):** concluída no preparo/verificação local nafontefe55a63b308d8378e3629f4a53a121c77d6ccc9d/PR #32. SQL0088 somente local após revisão;produtor porIDs cria linha+origem a partir doRECEIVED históricoT/N/R sem inferir conta porprovider_ref;vínculo porIDs origem/aplicação/request comreplay/três fences/locks/fila/journal/auditoria atômicos. UNKNOWN/conflito/ambiguidade residual mantêm crédito desconhecido;linha eorigem/vínculo imutáveis,DELETE administrativo restrito à sessão local/marker.47 próprios e1284 gerais unitários/62 arquivos,43 scripts,36 banco próprios finais e783 gerais/37 arquivos aprovados. Históricos/posição/run/claim/reserva/POST intactos,duascontas/Rfind/saldo/grants/session_user/fila-aviso-rollback/concorrência manual/T/Y verificados. Advisors finais sem achados;read-back88 migrations/25 públicas/55 privadas comRLS,4 perfis/markerfalse,metadados do ensaio vazios e seed12500/pending preservado. Check/build CI38223644784/job114725721665 success:1284 unitários/62 arquivos,43 scripts,sete páginas;checkout402c31ad4974203b5ee12b5301074595ef14595a/pais main9a25+fonte/head conferidos,extrato220495253b123e0d3f51d4047232d08d5d84989335b0357fa06e9b55a41657f7. Build local conservaEPERM/Turbopack. CI38223644784 terminou com1 timeout5000ms/782 banco aprovados,sem navegador/advisors remoto. Correção localizada do prazo30000ms nafonte a818eef,reteste36 aprovado;check/build exato CI38227632215/job114738947250 success:1284 unitários/62 arquivos/43 scripts,checkout f93bdbb4cf80529a9ee47ffc7b802d05b8ce0cd7/pais/head conferidos,extrato f15dc09b37e17b38686ffebc0be4f6408425aa852090f38b9ac338a1618d38c0. CI integral corrigido38227632215 concluído success:783 banco/37 arquivos,179 navegador/sete omissões planejadas,dois advisors sem achados;fonte a818eef/head/checkout/pais conferidos,extrato0ee3615725a12bd411fdb312ff156cf5a6381d6c5e57e091b4279fe693034024;PR32 pronto para revisão. Banco geral 37a59cce4eb2e80160d99d7b9f958c52e1eca6ff7419e095c2ea2e80f1f7d8ff;read-back d0c6903432d90c59c92c8651b506307b7b0a63ce9ad44e9a3a745b03ea6a1b7f. AE/AA/X/U concluídas no preparo/verificação local na fonte e792553;próximaV;J/V/parents abertos. Evidências emdocs/evidencias/pagamentos/origem-legado/README.md;sem cloud/publicação/operação real.

- **Jornada integral do legado (M3.01ae):** implementada evalidada localmente com15 ensaios próprios e798 gerais reais de banco/38 arquivos,seis jornadas em375/1440 px comAxe/30 capturas inspecionadas e dois retakes de preferência financeira;uploads/hashes/fila/avisos/entrega/download120s/bytes/auditoria/clienteB verificados. Intercalações/rollback/recibos eW tardio0/10500/null com reserva+claim/run/POST posteriores reais preservados. Controles/prefs/seed restaurados exatamente;read-back88 migrations/25 públicas/55 privadas comRLS,metadados financeiros vazios eadvisors sem achados.1284 unitários/62 arquivos/43 scripts verdes;build local mantém EPERM/Turbopack;fonte e792553a0547fdda45af664841b31928b77cf79d/PR33,CI38232179008/job114754059279 check/build success:1284 unitários/62 arquivos/43 scripts/sete páginas;checkout9c05a10f1bc4b54063b457d013222d2ba18a1ffd/pais main9a25+fonte/head conferidos,extrato88b89c0d262202b1f379c9fd3ec8283a21107f554d1934675063f38a38d05a2f. AE/AA/X/U concluídas no preparo/verificação local;CI38232179008 integral success:798 banco/38 arquivos,185 navegador/sete omissões planejadas e dois advisors sem achados;checkout/pais/head conferidos,extrato f39d2994f6da33b5f3aa928b4cab7a42a50374717d2ab6a9ca913c24e0cf2a9c. PR33 pronta para revisão com fonte preservada. PróximaAF,leituras em implementação local;V/J/parents/condições externas abertas. Evidências emdocs/evidencias/pagamentos/jornada-legado/README.md.

- **Leituras atuais (M3.01af):** implementadas e verificadas localmente na feat/leituras-credito. SQL0089 somente local; builders/snapshot/autorização e reserva por pedido, sinal/fila/saldo porW, DTOs atuais separados dos recibos. Nove unitários novos/1293 gerais em63 arquivos e43 scripts;814 banco/39 arquivos com16 próprios,31 focados préfinal,14 navegador próprios/regressões mais10 de entrega/jornada em375/1440/Axe e24 capturas próprias inspecionadas. Read-back89/25/55 comRLS/quatro perfis/markerfalse,metadados vazios,seed/controles idênticos ao último read-back verificado deAE;advisors após0089 e finais sem achados. Build local mantém EPERM/Turbopack;fonte b77a8c880e4a9ff1a8e74f5669c53b7b146301bc/PR34,CI38248514809/job114808421161 check/build success:1293 unitários/63 arquivos,43 scripts,sete páginas;checkout e9d9a21f688186ef9c29c2fe8f7ab18c521d8fca/pais main9a25+fonte/head conferidos,extrato02bbe85f36baf274331dc026e8a4eeccf373d28ad807a305c040fe7ba19ca4d7. AF reaberta paraAJ após regressões gerais dehistórico/reserva noCI34;implementação/check-build preservados,CI34cancelled/45min. PróximaAJ;AG/AH/AI/V/J/parents/condições externas continuam abertos. Evidências emdocs/evidencias/pagamentos/leituras-atuais/README.md.

- **Contrato/upload (M3.01ag):** implementados localmente emSQL0090 na feat/credito-contrato-upload. Retirada de contrato usaW;ordem dos locks financeiras antecede arquivo,com releitura de dono e preservação de replay/recibos/reservas.53 focados préfinal/18 próprios e guarda de identidade final isolada aprovados;conjunto final22 próprios/836 gerais em40 arquivos aprovado. Dez navegador375/1440/Axe/dez capturasQA aprovados;1293 unitários/63 arquivos e43 scripts passam,build local mantém EPERM/Turbopack. Advisors após0090 e finais sem achados;read-back90/25/55RLS/quatro perfis/markerfalse,metadados vazios/identidade e concessão temporárias removidas/donos econtroles restaurados. Fonte d25fed72d78c700dda65fb8e49a92d0db418fab2/PR35,check/build CI38253724198/job114826278059 success com1293 unitários/63 arquivos/43 scripts/sete páginas;checkout84426bf6e64a5b31727a09df65400f3dbb1e71ee/pais main9a25+fonte/head eextrato7e06505c1f0fcb809bf7603cd22b210d70e7b33e80adebfc74e30f795f741ab5 conferidos. AG concluída no preparo/verificação local;AJ/AH/AI/V/J/parents eobjetivo integral abertos. CI34 cancelado por45min após regressões de expectativas AF e timeout deação;CI35 cancelado voluntariamente porherdar os mesmos casos. Fontes preservadas/PRs draft;nenhuma aprovação integral remota.
- **Regressões dos consumidores (M3.01aj/ak):** histórico61/empates/cursor/retorno e reserva comUUID/payload/replay mantidos;Mailpit limita resultados daconsulta e destinatário exato. Limpeza específica metadados/objeto/auditoria/evento deupload confirmada cominterrupção;CI37 integral success nafonte81b7026 validaAF/AJ/AK/AL com836 banco/191 navegador/advisors eencerramento completos. Liberação debytes porW permaneceAH e jornadaAI obrigatórias antes deV/J/parents.
- **Duração do CI (M3.01al):** fonte81b7026/PR37 pronto para revisão;CI38269491889 integral success com1303 unitários/64 arquivos/43 scripts/build,836 banco/40 arquivos,191 navegador/sete omissões,dois advisors,cleanup e artefatos disponíveis. Checkoutd6ba5b9/pais main9a25+fonte/head/extratos conferidos. AF/AJ/AK/AL concluídas nopreparo/verificação local;AH/AI/V/J/parents/objetivo integral abertos. M3.14a nafeat/simulador-publico,SQL91 somente local,1321 unitários/65arquivos/43 scripts/cinco testes RPC,oito navegador/Axe/QA e32 regressões aprovados;read-back91/25/55/RLS/controles e dois advisors finais conferidos. Suíte geral local198 aprovados/sete omissões/uma falha de feedback ainda pendente no limite5s;diagnóstico isolado passou duas vezes com o mesmo limite e teste original restaurado. Build localEPERM;fonte final/CI integral pendentes.

## Como o agente trabalha com este plano

**O que ler em cada sessão:**
- "Onde estamos", "Insumos pendentes" e "Ordem de execução";
- a especificação da tarefa escolhida.

Não é preciso ler o arquivo inteiro.

**Como escolher a tarefa:** a primeira da "Ordem de execução" que atenda a tudo isto:
- está `[ ]`;
- tem as dependências concluídas;
- não é "responsável: Fábio" nem "responsável: André";
- não está travada por insumo pendente.

Se todas as disponíveis estiverem travadas, dizer ao Fábio exatamente o que falta.

**Uma tarefa por vez.** Cada tarefa cabe numa sessão. Os commits citam o ID, por exemplo: `Cria o app base (M1.30)`.

**Formato do Hub da Harmony** (regras completas em `docs/plan-md.md` do repositório do Hub):

| No arquivo | No Hub |
|---|---|
| `## Mn — Nome` | marco |
| `### Nome` | frente |
| `- [ ] M1.30 Título — nota` | tarefa |
| `### 🔒 GATE` | critérios de aceite, decididos pelo Fábio |

O título vai até o primeiro " — ". As seções "Especificação das tarefas" e "Decisões" são ignoradas pelo Hub.

**Concluir uma tarefa:**
- `[x]` só com `— evidência: …` (SHA, URL, saída de teste, consulta);
- trabalho parcial fica `[ ]` com "⏳" e uma nota do que falta.

**O agente não pode:** criar marco, marcar GATE ou mudar prazo de marco.

**Ao encerrar a sessão,** mesmo no meio de uma tarefa:
1. atualizar "Onde estamos" e, se algo chegou, "Insumos pendentes";
2. adicionar uma linha no "Registro de Execução";
3. fazer o commit.

**A partir do M3,** antes de começar cada marco, executar a tarefa `.00`: escrever a especificação de cada tarefa no mesmo formato do M1 e do M2, e pedir a aprovação do Fábio.

**Especificação que não bate com a realidade** (versão de biblioteca, API que mudou): corrigir a especificação na mesma entrega e registrar no Registro de Execução.

## Insumos pendentes

| Insumo | De quem | Trava | Situação |
|---|---|---|---|
| Aprovar os MCPs `andre-calculos-supabase` e `andre-calculos-vercel` e fazer o login com as contas novas | Fábio | M1.04, migrations na nuvem, M1.50 | concluído: OAuth e chamadas nativas confirmaram projeto Supabase e somente equipe Projeto Andre; consentimento final autorizado pelo Fábio, sem acesso a todos os projetos atuais/futuros |
| Incluir somente o projeto `andre-calculos` no acesso da conexão Vercel do cliente | Fábio | M1.04a; publicação pelo MCP em M2.34d | concluído: consentimento exclusivo confirmado pelo Fábio, OAuth com sucesso, MCP dedicado lista somente Projeto Andre/andre-calculos; get_project confirma os IDs e list_deployments funciona |
| Resolver o bloqueio efetivo de `vercel.com`, caso o navegador volte a ser necessário | Fábio | nenhuma tarefa atual da demonstração | bloqueio anterior não revalidado; publicação concluída pelo MCP e endereço público testado. Não é insumo para a demonstração |
| Decidir o áudio da reunião no primeiro commit | Fábio | M1.12 (push) | autorizado e executado em 2026-10-11; 24 commits/duas árvores filtrados, original íntegro preservado |
| Tratamento da transcrição antes da visibilidade pública autorizada                                              | Fábio                                         | CI de M1.13/M2.34                                     | autorizado e executado em 2026-10-11: histórico publicado sem transcrição, original local íntegro; caches antigos isolados em arquivo privado |
| Runtime Docker local (D17) | Agente, conforme execução integral autorizada | M1.40 a M1.44 | Colima 0.10.3 e Docker 29.9.0 instalados; perfil andre-calculos saudável; decisão de produto D17 permanece aberta |
| Confirmar a região São Paulo e assinar o plano Pro no Supabase e na Vercel, com o cartão do cliente | Fábio | M1.05, M1.44, M1.50 | Vercel gru1 conferida no deploy e health da demonstração; assinaturas Pro e confirmação dos demais requisitos continuam pendentes. Nenhuma compra executada |
| Instalar o app da Vercel do cliente na organização Harmony-Digital do GitHub, só com acesso a `andre-calculos` | Fábio | M1.50 | pendente; selecionar o novo repositório público ID 1414349093, não o arquivo privado |
| Confirmar se as contas do Supabase e da Vercel foram criadas com a conta-mãe (Gmail novo do cliente) | Fábio | M1.06 | a confirmar |
| Conta no Resend | Fábio | M2.28b/c e conclusão de M2.28 | pendente; M2.28a prepara somente modelos fictícios locais, sem conta, segredo ou envio |
| Cadastrar o projeto no Hub e criar a chave do agente | Fábio | M1.60, M1.61 | pendente |
| Decisões D7, D14, D16 e D17 | Fábio | ver "Decisões" | pendente |
| Nome completo, número do CRC (UF e categoria) e CPF ou CNPJ e razão social que aparecem no site e nas propostas | André | publicação de M2.02, M2.03 e M2.12 | pendente |
| Respostas do formulário de marca: nome e domínio (D3) | André | domínio do e-mail (M2.28) e M2.37 | pendente |
| Tabela de preços, adicionais, prazo padrão, folga e percentual de urgência (D10) | André | valores reais de M2.09 e M2.33 | pendente |
| Regra para contar meses contratuais, frações e fim do período sem demissão informada | André | preço de M2.12 | pendente; regra fictícia não usa data-base como término presumido |
| Regra para confirmar disponibilidade e propor entrega considerando a fila e a urgência (RF-22) | André | prazo de entrega de M2.12 | pendente; quantidade de pedidos não informa duração nem compromissos da agenda |
| Calendário oficial do TRT e conferência de três casos | André | fechamento de M2.10 e ativação dos lembretes de M2.30 | calendário local provisório, validação pendente |
| Validação dos campos do checklist (RF-20) | André | fechamento de M2.08 | pendente |
| Chave Pix e dados para o sinal | André | M2.16 | pendente |
| Número de WhatsApp para os alertas (D7) | André | M2.29 | pendente |
| Decisões D5, D6, D8 e D11 | André | M2.13, M2.27, M2.10 | pendente |
| Aprovação dos textos da página inicial, dos termos e da política | André | GATE M2 | pendente |
| Um processo antigo, com autorização, para o ensaio | André | M2.36 | pendente |
| Aprovar a especificação de M3.00 para implementação local fictícia | Fábio | implementação do M3 | concluído: Fábio respondeu “Aprovar e continuar a implementação local” em 2026-10-11 ao detalhamento da fonte b9b687d. Autoriza dados fictícios locais; condições específicas de contas/custos/decisões/publicação/operações reais permanecem |
| Conta e credenciais Asaas sandbox do cliente, sem valores no chat | Fábio | ensaio externo de M3.01c | pendente; comprovar associação account.id/carteira/credencial e compatibilidade de CNPJ alfanumérico/timestamps antes do driver real. Adaptador/cenários locais autorizados por M3.00; produção depende de D9 e M3.03 |
| Critérios completos de garantia: duração, termo inicial, responsabilidade e acesso histórico durante ajuste | André com revisão jurídica | M3.05/06 | pendente; D5/D11 seguem abertas; atraso isolado não comprova culpa |
| Identificação privada do signatário e mecanismo aprovado de validação ICP-Brasil | André e Fábio | ensaio real de M3.08 | pendente; não presumir API autorizada a partir do site público VALIDAR |
| Propriedades Google/Meta, configuração DataJud e textos de consentimento na conta do cliente | Fábio e André | ativação real de M3.13/16/17/21 | pendente; cenários fictícios e preparação local não comprovarão integração externa |
| Política de retenção e destino/custo de backup externo aprovados | André e Fábio | ativação de M3.18/22 | pendente; política precede backup/restauração, que precedem exclusão real, sem dependência circular |

## Ordem de execução (M1 e M2)

1. **Já dá para fazer (agente):** M1.11 → M1.30 → M1.31 → M1.32 → M2.19 → M2.09 → M2.10 → M2.11 → M2.08 (interface e schema, ainda sem salvar) → M2.02 (com marcadores no lugar dos dados do André) → M2.03 (rascunho).
2. **Depois de M1.10 (áudio):** M1.12 → M1.13.
3. **Depois de M1.03 (MCPs):** M1.04 → M1.05.
4. **Depois de M1.08 (Docker):** M1.40 → M1.41 → M1.42 → M1.43 → M1.44 → M1.22.
5. **Fila e publicação:** M1.51a pode usar a parte local verificada de M1.42/M1.43 e M2.28a antes da integração Vercel; M1.51b prepara o executor fictício local; M1.52a prepara o manual documental antes da confirmação do plano/backup. Depois de M1.50 (Vercel ligada ao GitHub), M1.51c → M1.52 → M1.23 (Fábio) → GATE M1.
6. **M2 com banco:** M2.04 → M2.05 → M2.06 → M2.33 → M2.12 → M2.14 → M2.15 → M2.16 → M2.17 → M2.18 → M2.20 → M2.21 → M2.22 → M2.23 → M2.24 → M2.25 → M2.26 → M2.26a → M2.27 → M2.13 → M2.32.
7. **Notificações:**
   - M2.28e integra o aviso de sinal ao caso de uso já verificado, antes do transporte real, usando apenas banco/dados locais;
   - M2.31 pode ser verificada antes dos provedores: os casos de uso existentes enfileiram no banco local e permitem comprovar as preferências sem enviar mensagens;
   - preparação local de seleção/deduplicação de M2.30 pode seguir, com calendário provisório e sem ativar o cron real;
   - M2.28 precisa da conta no Resend (e do domínio, para produção);
   - M2.29 precisa de D7;
   - ativação de M2.30 depende do calendário confirmado e do cron/provedores nas contas do projeto.
8. **Fechamento:** M2.34 → M2.35 → M2.36 → M2.37 → GATE M2.

## M1 — Fundação técnica

Prazo sugerido: 2026-10-13

### Contas e conexões

- [x] M1.01 Criar as contas do cliente no Supabase e na Vercel — evidência: criadas pelo Fábio em 2026-10-10; projeto do Supabase `qtofwbxujshroaafxowr`
- [x] M1.02 Conectar o projeto às contas certas e bloquear as contas de outros clientes — evidência: `.mcp.json` com `andre-calculos-supabase` (restrito ao projeto `qtofwbxujshroaafxowr`) e `andre-calculos-vercel`; `.claude/settings.json` bloqueia os MCPs de outras contas e os comandos que revelam segredos (bloqueio testado com `printenv` em 2026-10-10); hook `SessionStart` roda `scripts/preflight.sh` (testado: GitHub, repositório e 1Password OK)
- [x] M1.03 Aprovar os MCPs do projeto e fazer o login com as contas novas do cliente — evidência: `codex mcp login` concluído com código zero para ambos; consentimento final Vercel somente Projeto Andre, conforme autorização explícita das 35 permissões; ferramentas dedicadas disponíveis no chat; docs/evidencias/mcp/validacao-2026-10-11.md
- [x] M1.04 Conferir os dois MCPs e registrar os identificadores do cliente — evidência: chamadas nativas `get_project_url` para qtofwbxujshroaafxowr, `list_teams` com somente Projeto Andre/projeto-andre1/team_4fdLDCsB0ROvP5ph50aFNvxm e `get_team` correto; `list_projects` da equipe vazio, valores esperados registrados e `bash scripts/preflight.sh` aprovado; docs/evidencias/mcp/validacao-2026-10-11.md
- [x] M1.04a Conceder ao MCP Vercel acesso exclusivamente ao projeto andre-calculos — evidência: Fábio confirmou consentimento somente ao projeto, OAuth com sucesso; list_teams somente Projeto Andre, list_projects somente andre-calculos/prj_tdmzmC6utVU2fHPz0iVhroMD8NtI, get_project com equipe correta e list_deployments sem403. docs/evidencias/mcp/validacao-2026-10-11.md
- [ ] M1.05 Confirmar a região e o plano do Supabase e da Vercel — responsável: Fábio confirma no painel; o agente registra
- [ ] M1.06 Confirmar a conta-mãe do cliente e guardar o acesso no cofre só de pessoas — responsável: Fábio; D16
- [ ] M1.07 Criar a conta no Resend com a conta-mãe — responsável: Fábio
- [ ] M1.08 Instalar o OrbStack ou o Docker Desktop para o Supabase local — responsável: Fábio; D17

### Repositório e organização

- [x] M1.10 Tirar o áudio da reunião do primeiro commit antes do push — evidência: autorização do Fábio em 2026-10-11; 24 commits/duas árvores filtrados, nenhum blob alcançável e original com mesmo SHA-256/19.552.708 bytes; docs/evidencias/git/retirada-audio.md
- [x] M1.10a Retirar a transcrição de todo o histórico Git preservando o original local — evidência: 27 commits e todas as referências filtradas/conferidas, original com SHA-256/tamanho idênticos; novo remoto público independente sem caminhos/blobs privados e consultas anônimas antigas HTTP 404; caches residuais do GitHub restritos ao arquivo privado, sem purga física; docs/evidencias/git/retirada-transcricao.md
- [x] M1.11 Organizar a pasta do projeto — evidência: transcrição e pesquisas movidas preservando o conteúdo; README e referências atualizados; 13 documentos conferidos, zero links locais quebrados (2026-10-11)
- [x] M1.12 Fazer o primeiro push para Harmony-Digital/andre-calculos — evidência: conta fabioalmeidadigital, SHA remoto cc34885848e694887e7da7be626e87d2e037118a e clone bare independente com 25 commits sem áudio; docs/evidencias/git/primeiro-push.md
- [x] M1.13 Criar o CI de qualidade e proteger a main — evidência: ruleset 24880297 aplicado/read-back na main, PR e qualidade/e2e estritos sem bypass; CI 38142154491 verde no PR #1/SHA b7d4390ca522d3d127062f796acf5a9be5966787; integrado em f0f900740ed60cb5cd655ce414b8b342ea35b0d9 com árvore integral idêntica; docs/evidencias/git/ci.md

### Segredos (1Password)

- [x] M1.20 Criar o cofre proj-andre-calculos e a conta de serviço do agente com leitura só nesse cofre — evidência: `scripts/configurar-1password.sh` rodou em 2026-10-10 com aprovação do Fábio; o cofre já existia, a conta `sa-andre-calculos-agente` foi criada com `read_items`, o token está nas Chaves do macOS (`op-sa-andre-calculos-agente`) e o teste mostrou que a conta enxerga só `proj-andre-calculos`
- [ ] M1.21 Cadastrar no cofre os itens de cada serviço quando ele for configurado — responsável: Fábio
- [ ] M1.22 Criar o app/.env.tpl e o script scripts/com-segredos.sh — ⏳ referências e scripts criados, bash -n aprovado; dev-env injeta apenas chaves locais em memória, sem .env; falta ensaio op run com os itens de M1.21
- [ ] M1.23 Cadastrar as variáveis de produção na Vercel — ⏳ lista e scripts/sincronizar-vercel.sh preparados; doze testes fictícios de destino/transporte/falha parcial aprovados; metadados reais, D14, execução pelo Fábio e validação na produção pendentes
- [x] M1.24 Configurar segredos no CI se algum job precisar — evidência: não necessário em 2026-10-11; workflow sobe Supabase local e gera credenciais fictícias em memória, sem segredos de produção

### Aplicação base

- [x] M1.30 Criar o app Next.js 16.4 em app/ — evidência: Next 16.4.0, React 19.3.0, Node 22; npm run check aprovado em 2026-10-11
- [x] M1.31 Criar a base visual provisória do site, da área do cliente e do painel — evidência: Playwright/axe aprovado em 375/1440 px; navegação e ausência de overflow verificadas em 2026-10-11
- [x] M1.32 Criar a rota de saúde com o SHA do commit — evidência: dois testes unitários e GET real via Playwright aprovados; SHA/região Vercel e fallback local verificados

### Banco, autenticação e arquivos

- [x] M1.40 Montar o Supabase local com dados fictícios — evidência: scripts/seed-dev.ts cria quatro usuários @exemplo.com e processo inventado; 16 consultas/testes de RLS locais aprovados em 2026-10-11
- [x] M1.41 Ligar o app ao Supabase com @supabase/ssr — evidência: páginas server leem perfil real; testes e2e confirmam cookies HttpOnly e ausência de tokens acessíveis ao JavaScript em 2026-10-11
- [ ] M1.42 Criar as migrations iniciais com RLS — ⏳ onze migrations locais aplicadas, 24 testes de RLS aprovados, advisors segurança/desempenho e db lint sem achados; falta aplicar/verificar na nuvem pela conexão dedicada
- [x] M1.43 Configurar o login e os papéis cliente, calculista e admin — evidência: e2e login/logout/acesso negado em 375/1440 px aprovados; Auth verifica getUser e profiles.role, sem confiar no papel em metadata (2026-10-11)
- [ ] M1.44 Configurar os buckets privados com upload retomável e URL assinada curta — ⏳ bucket local privado; ensaio real de 314572800 bytes retomou de 12582912 bytes, hash confirmado; download auditado/120 s e cliente B negado em ambas telas; falta configurar e verificar limite Pro na nuvem

### Publicação e operação

- [ ] M1.50 Criar o projeto na Vercel ligado ao repositório e publicar a produção — ⏳ projeto exclusivo andre-calculos criado em Projeto Andre e demonstração fictícia publicada pelo MCP no domínio original. Integração GitHub e publicação comercial pendentes. Responsável: Fábio liga a integração; o agente configura
- [ ] M1.51 Criar a fila de envios no banco e o Vercel Cron — ⏳ produtores transacionais e deduplicação já usam public.notifications; processamento dividido antes da implementação em M1.51a/b/c. Ativação externa depende de M1.42 e M1.50
- [x] M1.51a Preparar reservas e resultados persistentes da fila no banco local — evidência: migrations0052/53/54 aplicadas somente localmente; 16 unitários próprios/434 totais/25 scripts e 25 próprios/340 banco aprovados, advisors sem achados e revisões independentes concluídas. npm run check/build remoto aprovado na fonte558a5c7ebefad7150302280a86efa8340c43cb91, job114571144088/CI38173586727. CI38173586727 completo aprovado com 340 banco/165 e2e/sete omissões e advisors sem achados; PR #11 pronto para revisão; núcleo não ativa transporte/cron/nuvem. docs/evidencias/notificacoes/fila/README.md
- [x] M1.51b Preparar o executor local com transporte fictício — evidência: migration0055 somente local; 30 próprios/370 banco gerais, 43 unitários dos módulos/461 gerais/25 scripts, advisors e revisões independentes aprovados; npm run check/build remoto da fonte85568bcd004d387ab216bba5c23a95fbef52962e aprovado no job114574690764/CI38174754842. CI38174754842 completo aprovado: 370 banco/165 e2e/sete omissões/advisors sem achados; PR #12 pronto para revisão, fonte preservada. Sem transporte externo/endpoint/cron. Read-back das fixtures zerado; docs/evidencias/notificacoes/executor/README.md
- [ ] M1.51c Ativar o cron e os adaptadores autorizados — depende de M1.51b, M1.50, credenciais e autorização de infraestrutura/envio
- [ ] M1.52 Confirmar o backup diário do banco e documentar a restauração — ⏳ manual documental M1.52a concluído; falta M1.05 e confirmação real do backup no painel. Nenhuma restauração/compra/Storage protegido comprovados
- [x] M1.52a Preparar o manual de backup e restauração — evidência: fonte79fc356c8c56579cc4375214d2f2275504cef7b3/PR #14, docs/operacao.md, npm run check/build remoto CI38176671146/job114580408182 aprovado (461 unitários/43 scripts); fontes oficiais backups/clone/CLI conferidas em 2026-10-11, oito links/destinos e referências locais válidos, git diff --check e duas revisões independentes sem bloqueador. Inclui teste mensal, papéis, identidade, matriz de validação e isolamento físico/lógico; sem restore/compra/produção. M1.52/M3.22 abertos

### Gestão no Hub

- [ ] M1.60 Cadastrar o projeto no Hub e importar este plano — responsável: Fábio
- [ ] M1.61 Conectar o Claude Code ao MCP do Hub — depende de M1.60

### 🔒 GATE M1 (aprovação do Fábio)

- [ ] Os MCPs do Supabase e da Vercel conferidos nas contas do cliente, e o preflight sem problemas
- [ ] Repositório no GitHub com CI verde
- [ ] App em produção na Vercel (região São Paulo) com `/api/health` mostrando o SHA
- [ ] Login funcionando e acesso negado testado entre dois clientes
- [ ] Upload de PDF grande funcionando direto para bucket privado
- [ ] Backup diário do banco ativo e restauração documentada
- [ ] Nenhum segredo fora do 1Password, e a conta de serviço do agente só enxerga o cofre `proj-andre-calculos`

## M2 — Portal comercial no ar (MVP)

Prazo sugerido: 2026-10-20

### Marca e site público

- [ ] M2.01 Preparar o formulário de marca e gerar as opções de nome — ⏳ formulário com 15 perguntas em docs/marca/formulario.md; aguardando respostas para propor nomes e verificar domínios
- [ ] M2.02 Criar a página inicial — ⏳ prévia responsiva e axe aprovados; falta identidade/CRC, tabela ativa, textos de garantia e aprovação do André
- [ ] M2.03 Escrever os termos de uso e a política de privacidade versão 1 — ⏳ rascunhos versionados e páginas locais verificadas; falta revisão jurídica, dados reais e registro de aceite em consents

### Cadastro e conta

- [ ] M2.04 Criar o cadastro e o login do cliente — ⏳ RF-10 implementado e e2e de confirmação Mailpit/login aprovado com dados e aceites sintéticos; CPF/CNPJ numérico e alfanumérico, E.164 e OAB/UF validados; cadastro público ainda bloqueado até conteúdo legal aprovado e Auth/SMTP de produção conferidos
- [x] M2.04c Apresentar falha de link e verificar o retorno automático — evidência: fonte9843f5df385ef072ab762191bf4e50aaa67e9b85/CI38171804330/job114565777210 com npm run check/build aprovados (418 unitários/25 scripts), sete próprios e 18 e2e/duas omissões planejadas em375/1440; Mailpit/cadastro/jornada sem navegação corretiva, replay/inválido/outro navegador sem sessão, dois PNG com QA independente. docs/evidencias/autenticacao/retorno/README.md; sem alterar Auth/configuração/produção
- [x] M2.05 Avisar o André a cada novo cadastro — evidência: e2e confirmou notificação new_signup na fila local, com nome/OAB/cidade e sem documento; destino configurado e preferências respeitados; envio real depende de M2.28/29 (2026-10-11)
- [x] M2.06 Criar a página da conta com perfil, senha e pedido de exclusão — evidência: três fluxos e axe em 375/1440 px aprovados; perfil por RPC auditada, senha nova funciona e segundo dispositivo perde acesso; pedido idempotente preserva conta/retenção (17 testes RLS, 2026-10-11)

### Checklist e orçamento

- [ ] M2.07 Receber do André a tabela de preços e os prazos — ⏳ questionário em docs/precos/questionario.md e tabela de exemplo local inativa preparados; respostas e ativação da tabela real pelo André pendentes
- [ ] M2.08 Criar o checklist trabalhista em etapas com schema versionado — ⏳ schema v1/CNJ, nove etapas persistidas, retomada e revisão concorrente verificados em 375/1440 px e 19 testes RLS; imagens em docs/evidencias/checklist; falta validação dos campos pelo André
- [x] M2.09 Criar o motor de preço determinístico — evidência: testes de base/adicionais/urgência/arredondamento/limites; 100% das linhas e branches de pricing.ts executados em 2026-10-11
- [ ] M2.10 Criar a calculadora de prazo processual em dias úteis — ⏳ calendário/folga e testes Carnaval/Páscoa/20-11/recesso aprovados; fontes em docs/calendario-processual.md; falta calendário oficial do TRT e conferência de três casos pelo André
- [x] M2.11 Criar o classificador de complexidade — evidência: testes por regra e limites configuráveis; painel salva os limites por RPC auditada e checklist os carrega por projeção mínima protegida; 24 testes RLS aprovados (2026-10-11)
- [ ] M2.12 Criar a tela de orçamento e o PDF da proposta — ⏳ fluxo fictício local com numeração anual, snapshot imutável, tela e PDF privado verificados; reenvio/concorrência/rollback e acesso entre clientes testados; emissão comercial depende de dados reais, calendário, regra de meses e disponibilidade; aceite contratual preparado em M2.15 e recusa verificada em M2.12a
- [ ] M2.13 Criar o caminho Só o PDF com taxa de triagem — RF-24; D5
- [x] M2.14 Avisar o André a cada orçamento gerado — evidência: migration local 0035, oito testes RLS específicos e oito regressões de navegador em 375/1440 px; enfileiramento transacional, preferências, dedup/rollback e zero avisos para simulações; positivo com proposta legada sintética, emissão comercial ainda depende de M2.12 e envio de M2.28/29; docs/evidencias/propostas/avisos.md (2026-10-11)

### Pedido, upload e pagamento

- [ ] M2.15 Registrar o aceite eletrônico da proposta — ⏳ RF-30 preparado localmente com conteúdo/termos arquivados, recibo imutável, reenvio, auditoria/avisos transacionais e guardas de simulação; contrato sem documento aguarda envio e o primeiro upload confirmado libera a fila; contratação real depende do produtor comercial de M2.12 e textos legais aprovados; evidência em docs/evidencias/propostas/aceite.md
- [ ] M2.16 Criar o pagamento manual do sinal com confirmação do André — ⏳ RF-31 preparado e verificado localmente com Pix privado, confirmação do restante, recibos/replay, parcelas/estornos e fila após documento; ativação depende de Pix/insumos reais, produtor comercial e textos legais; evidência em docs/evidencias/pagamento-manual/README.md
- [x] M2.17 Permitir marcar cliente com contrato — evidência: migrations locais 0043–0045, quinze casos de banco e seis e2e próprios em 375/1440 px; motivo/revisão/recibo privado, contrato antes/depois do aceite/documento, replay/concorrência/rollback e pagamentos preservados; retirada bloqueada em trabalho ativo; docs/evidencias/clientes-com-contrato/README.md (2026-10-11). Ativação comercial segue dependente de M2.12 e insumos reais
- [ ] M2.18 Criar o upload retomável de documentos — ⏳ RF-33 verificado no Supabase local com rede interrompida e isolamento; pasta dos pedidos persistidos acessível no e2e de rascunho; falta validação na nuvem
- [x] M2.19 Criar a máquina de estados do pedido — evidência: transições, papéis, propriedade, aceite/sinal/contrato e revisão de entrega testados em 2026-10-11
- [x] M2.19a Operar análise, cálculo e revisão pela pasta do processo — evidência: fonte 45a32d9, docs/evidencias/pedidos/operacoes.md; CI38162207294 aprovado com 358 unitários, doze testes de scripts/build, 160 banco, 117 e2e/sete omissões e advisors locais sem achados. Seis e2e próprios em 375/1440 px, retorno à origem/replay/conflito/rollback e jornada sem prepareTechnicalReview conferidos. PR #3; sem publicação das operações.
- [x] M2.12a Registrar recusa de proposta pelo cliente — evidência: fonte 5173391, migration 0051, 33 regressões próprias/315 banco, 379 unitários/doze scripts, quatro e2e próprios e doze regressões de aceite/jornada em 375/1440 px; advisors sem achados. Evidência: docs/evidencias/orcamento/recusa/README.md. CI38166216291 completo aprovado: npm run check/build, 315 banco, 121 e2e/sete omissões e advisors sem achados; PR #6 pronto para revisão. Build local recusado pela porta interna do Turbopack.
- [x] M2.04a Impedir cadastro direto sem aceite jurídico — evidência: fonte 2cab40d, migrations locais 0047/0048 e docs/evidencias/cadastro/aceite-juridico.md; 24 regressões Auth/grants, 184 banco, seis e2e/duas omissões em 375/1440 px aprovados. npm run check/build aprovado no job qualidade do CI38163619398, advisors locais sem achados; PR #4 dependente de #3; CI38163619398 completo aprovado com 184 banco, 117 e2e/sete omissões e advisors sem achados. Nenhuma mudança de Auth na nuvem; textos comerciais de M2.03 continuam pendentes.
- [x] M2.04b Validar os campos do cadastro também no hook Auth — evidência: fonte 4af6407, migrations locais 0049/0050 e docs/evidencias/cadastro/campos-auth.md; 98 regressões de campos, 282 testes reais de banco e seis e2e/duas omissões em 375/1440 px aprovados. Job qualidade do CI38164584726 aprovou npm run check completo/build, 362 unitários/doze scripts; advisors locais sem achados. PR #5 pronto para revisão, dependente de #4/#3; CI38164584726 completo aprovado: 282 banco, 117 e2e/sete omissões e advisors sem achados. Bootstrap/gate jurídico preservados; nenhuma mudança Auth na nuvem.

### Pasta do processo

- [x] M2.20 Criar a pasta do processo com abas e visualizador de PDF — evidência: seis abas compartilhadas cliente/painel, quatro pastas e PDF sob demanda; 5 e2e específicos aprovados em 375/1440 px (um ensaio único omitido no celular), cliente B/admin/anônimo recebem 404, calc autorizado; HEAD/Range/206/416, senha/cancelamento e axe aprovados; docs/evidencias/pasta-processo (2026-10-11, banco local)
- [ ] M2.21 Criar a linha do tempo automática — ⏳ filtro, paginação, notas e helper transacional verificados localmente; quatro e2e em 375/1440 px e seis testes específicos de RLS. Rascunho/upload/mensagem/decisão/concordância/entrega/proposta/aceite, pagamento manual e entrada na fila por contrato/sinal/documento já usam o helper; ativação e os casos futuros permanecem dependentes dos módulos correspondentes. Evidência: migrations 0016–0018, docs/evidencias/linha-do-tempo/README.md, docs/evidencias/decisoes/README.md e docs/evidencias/entrega/README.md
- [ ] M2.22 Criar as mensagens entre cliente e André — ⏳ conversa/anexos/retry/paginação verificados localmente em 375/1440 px, com seis e2e e nove testes de RLS específicos; avisos new_message enfileirados; despacho depende de M2.28/29. Evidência: migrations 0013–0015 e docs/evidencias/mensagens/README.md
- [x] M2.23 Criar o registro de decisões técnicas com exportação em PDF — evidência: quatro e2e em 375/1440 px e seis testes específicos de RLS; premissa, concordância do cliente, replay/concorrência, privacidade e PDFs de uma/seis páginas conferidos; migrations locais 0018–0019 e docs/evidencias/decisoes/README.md (2026-10-11). CRC/dados reais seguem como insumo de publicação
- [x] M2.24 Criar o índice de páginas do processo — evidência: quatro e2e em 375/1440 px, seis RLS específicos e quatro unitários; CRUD, revisão concorrente, reenvio após remover arquivo e paginação de 61 referências com empates verificados; migrations locais 0020–0022 e docs/evidencias/indice/README.md (2026-10-11)

### Fila, prazos e entrega

- [x] M2.25 Criar a fila do André ordenada pelo prazo interno — evidência: quatro e2e em 375/1440 px e quatro unitários; 116 pedidos com datas empatadas/ausentes, filtro antes do limite e pagamentos parciais/confirmados verificados; migration local 0023, docs/evidencias/fila/README.md (2026-10-11)
- [x] M2.26 Criar a entrega com checklist de pré-juntada — evidência: quatro e2e em 375/1440 px, seis RLS específicos e três unitários; snapshots imutáveis, replay/concorrência, confirmação humana e aviso enfileirado verificados. Migrations locais 0024–0026, docs/evidencias/entrega/README.md (2026-10-11); despacho real depende de M2.28
- [x] M2.26a Paginar entregas confirmadas no resumo do processo — evidência: dois e2e em 375/1440 px; cliente/painel recuperaram 61 registros com empates e microssegundos, cursor inválido/retorno ao início/axe/largura verificados. docs/evidencias/entrega/README.md (2026-10-11)
- [ ] M2.27 Liberar o download das entregas com URL assinada e auditoria — ⏳ controles locais concluídos: download auditado de 120 s, aprovação explícita de regra futura/individual sem efeito retroativo, instruções Pix/saldo por pedido, parcial/estorno/isolamento; 64 RLS e 77 e2e aprovados. Falta escolha real de D6 pelo responsável técnico. Evidência: docs/evidencias/liberacao/README.md e docs/evidencias/entrega/README.md

### Notificações

- [ ] M2.28 Configurar os e-mails transacionais e o SMTP do login com o Resend — RF-70; dividido em modelos transacionais M2.28a, transporte M2.28b, SMTP M2.28c e modelos locais de autenticação M2.28d; conta/domínio e teste real permanecem pendentes
- [x] M2.28a Criar e verificar os modelos de e-mail com dados fictícios — evidência: 16 modelos HTML/texto; 24 testes específicos, 403 unitários/doze scripts e 32 e2e em 375/1440 px aprovados, QA visual/axe sem achados; npm run check/build remoto aprovado no job qualidade 114555367460/CI38168299312, fonte d065be6f0ffdc2e1f42f015d766ee79430cd5096. docs/evidencias/emails/README.md; sem envio; CI completo aprovado com 315 banco/153 e2e/sete omissões e advisors sem achados; PR #7 pronto para revisão
- [ ] M2.28b Integrar os modelos ao adaptador Resend e verificar destinatário de teste — parte de M2.28; depende de conta/credenciais do cliente e fila de M1.51; envio real exige autorização
- [ ] M2.28c Configurar o SMTP e os textos de autenticação em português — parte de M2.28; responsável: Fábio configura Auth/segredos; agente prepara e verifica ensaio autorizado
- [x] M2.28d Preparar modelos locais de confirmação, acesso e recuperação — evidência: fonte03b4d778c8cc924ff2a3a25dd04911fb85e7899c/CI38170815863/job114562860596 com npm run check/build aprovados, 411 unitários/25 scripts; oito próprios, 38 e2e dos 19 modelos e seis capturas com QA independente. docs/evidencias/emails/autenticacao/README.md; sem aplicar templates, Auth/SMTP ou envio
- [x] M2.28e Enfileirar o aviso de sinal confirmado ao cliente — evidência: fonte5d3db8a1f63758e0a619605052f30e60e3af1153/PR #15, check/build CI38178835637/job114586864386 aprovado (461 unitários/44 arquivos, 43 scripts); checkout8d74e4e2f6132189589b192264286b4ef1a2b65a/pais conferidos. Etapa geral de banco no job114586864267 success, término22:08:30UTC; 27 testes específicos/regressões locais passaram, incluindo14 do aviso e perfil mínimo. Migrations0056/0057 somente locais, advisors/revisões sem bloqueador, fixtures limpas. Navegador remoto em execução; sem despacho/nuvem. docs/evidencias/notificacoes/sinal/README.md
- [ ] M2.29 Enviar alertas ao André por WhatsApp — D7
- [ ] M2.30 Agendar os lembretes de prazo — ⏳ RF-53 preparado/verificado localmente: seleção, janela, recibos, cancelamento e cron autenticado; onze novos testes de banco, 27 novos unitários e HTTP/axe em 375/1440 px. Calendário TRT, cron Vercel e despacho real pendentes; evidência: docs/lembretes-de-prazo.md e docs/evidencias/lembretes (2026-10-11)
- [x] M2.31 Criar as preferências de notificação do André — evidência: nove eventos/dois canais com vínculo persistente, revisões concorrentes, recibos imutáveis e auditoria; sete ensaios RLS específicos e dois e2e em 375/1440 px confirmaram canal desligado sem novo aviso, reenvio antigo sem desfazer mudança e falha de rede antes/depois de gravar. Migration local 0029, lint/advisors sem achados, docs/evidencias/notificacoes/README.md (2026-10-11); despacho real segue em M2.28/29

### Painel do André

- [x] M2.32 Criar a página inicial do painel — evidência: seis contagens exatas e listas paginadas coerentes; dois e2e específicos em 375/1440 px com 116 atrasados/61 propostas, filtros, papéis, axe e largura verificados; dez regressões de painel/decisões/fila, suíte completa com 79 e2e e npm run check com 271 unitários/build aprovados. docs/evidencias/painel/README.md (2026-10-11, banco local)
- [ ] M2.33 Criar as configurações do painel — ⏳ telas/RPCs locais, dados profissionais/Pix/condições/horários/limites e histórico de preços verificados; 24 RLS e 44 e2e aprovados; snapshots de preços/settings ligados à proposta fictícia de M2.12; falta tabela real validada pelo André

### Qualidade e publicação

- [x] M2.34 Testar o fluxo completo de ponta a ponta no Playwright — evidência: job e2e 114478041670/CI 38142154491 verde, 109 aprovados e sete omitidos somente no celular; 142 testes de banco, npm run check e advisors locais aprovados. Jornada em 375/1440 px e três pontes sintéticas documentadas em docs/jornada-local.md; docs/evidencias/git/ci.md e docs/evidencias/jornada-local/README.md
- [x] M2.34a Corrigir os controles cortados ao concluir o checklist no celular — evidência: jornada repetida em 375/1440 px, todos os controles contidos no painel e captura celular/02-checklist.png em docs/evidencias/jornada-local; npm run check verde
- [x] M2.34b Criar demonstração navegável com identidade e dados fictícios — evidência: rota /demonstracao, marca Marco/CRC DEMO-000000/O, oito testes de regras aprovados; autorização do Fábio em 2026-10-11; sem banco, pagamento ou envio real; docs/evidencias/demonstracao/README.md
- [x] M2.34c Validar a demonstração em 375 e 1440 px — evidência: quatro e2e próprios aprovados, jornada/checklist/proposta/timeline/calendário/reinício, axe sem violações e zero chamadas externas; CI 38153083358/SHA abe2fb4 aprovado: npm run check/build, 348 unitários, doze scripts, 142 RLS, 113 e2e/sete omissões e advisors sem achados; README da demonstração
- [x] M2.34d Publicar a demonstração no endereço original da Vercel — evidência: fonte main 9a25f31, 158 arquivos conferidos, publicação MCP na equipe/projeto esperados; deploy dpl_D8FCmhRtUpTP4mftZr7RfbW6jeZ7 READY em gru1, https://project-rucji.vercel.app/demonstracao público sem login Vercel. Quatro testes hospedados em 375/1440 aprovados, axe sem violações e oito capturas; docs/evidencias/demonstracao/README.md e hospedada/validacao.json
- [ ] M2.35 Fazer a revisão de segurança antes da publicação
- [ ] M2.35a Tratar GHSA-vfj7-8cjw-p6xm nas ferramentas de qualidade — ⏳ preexistente na fonte 5173391; cinco registros high na cadeia ESLint/fast-glob/micromatch/braces, todos dev, sem patch oficial em 2026-10-11. Audit omitindo dev: zero vulnerabilidades. Coletor aprovado em dez testes próprios/22 scripts e 403 unitários; build/qualidade CI38169457310 da fonte b1a201f aprovados. Artefato real conferido: 35 traces/300 JS, zero referências/marcadores identificáveis, cobertura incompleta por um symlink; CI38169457310 integral aprovado com 315 banco/153 e2e/sete omissões e advisors sem achados; PR #8 pronto para revisão. Diagnóstico adicional de artefato/trace com motivo fixo passou em treze testes próprios/25 scripts; nova coleta aprovada na fonte03b4d77/CI38170815863: artifact_symlink_skipped em .next/node_modules/@react-pdf/renderer, sem seguir o alvo. Cobertura incompleta preservada. Referências ao código incorporado no Next têm versão indeterminada; ausência de marcador não prova ausência no bundle. Evidência: docs/evidencias/seguranca/audit-dependencias.md e inventario-build.md
- [x] M2.35b Inspecionar a dependência externalizada com limites e destino conferido — evidência: fonte62c8def76cfc5bdc1a867f97ce591a320cb7aac5/PR #13, check/build CI38175897388/job114578103904 aprovado (461 unitários/43 scripts/31 próprios); JSON real/hash/source/checkout/lock/configuração conferidos. 35 traces/301 JS e quatro JS/39.932 bytes do alias PDF inspecionados, contadores zero. Parte técnica concluída; advisory M2.35a e revisão integral abertos. docs/evidencias/seguranca/inventario-build.md e build-dependencies-62c8def.json
- [ ] M2.35c Revisar os avisos de lint SQL dos validadores de CPF/CNPJ — oito avisos preexistentes de variáveis sombreadas/não usadas, identificados no ensaio M2.28e. Preparar correção local versionada e regressões dos documentos antes de executar; não altera schema/Auth na nuvem
- [ ] M2.36 Ensaiar com o André um processo antigo autorizado — responsável: André com o agente
- [ ] M2.37 Publicar o MVP no domínio definido — D3; aprovação do Fábio antes de divulgar

### 🔒 GATE M2 (aprovação do Fábio e do André)

- [ ] Um cliente de teste completa o fluxo inteiro no celular e no computador
- [ ] O André recebe os alertas por WhatsApp e e-mail com o pedido e a data de entrega
- [ ] O orçamento sai na hora, discriminado, com CRC e PDF
- [ ] Nenhum documento é acessível por outro cliente (teste de acesso negado registrado)
- [ ] O André aprova textos, preços, termos e política

## M3 — Validação comercial

Prazo sugerido: 2026-11-17 (a confirmar com o André)

### Planejamento do marco

- [x] M3.00 Detalhar as tarefas do M3 na especificação e pedir aprovação do Fábio — evidência: 32 especificações da fonte b9b687d e aprovação registrada do Fábio em 2026-10-11: “Aprovar e continuar a implementação local”. Incorporadas lições dos ensaios fictícios; autoriza somente implementação local fictícia conforme condições do plano. Ensaio com André, operações reais e GATEs continuam pendentes

### Pagamento automático

- [ ] M3.01 Integrar o Asaas em sandbox — cliente, cobrança do sinal e do saldo, link de Pix, boleto e cartão, webhook idempotente (RF-31)
- [x] M3.01a Preparar o adaptador de pagamento e os cenários fictícios — evidência: partes M3.01d/e/f verificadas nas fontesa2cb04a/58f61cf/3dabd4d, PRs #16–18, check/build remoto aprovado;414 testes próprios/878 gerais/43 scripts na última fonte. Contratos precisos/porta fixture/normalização cumulativa sem efeitos. Preparo local concluído; conta autenticada, suporte real de documentos/formatos e driver/ensaio externo seguem em M3.01c. M3.01 permanece aberta
- [x] M3.01d Preparar os contratos precisos do Asaas — evidência: fontea2cb04a87e23ae85581d2eb7f42881dfc24b7dae/PR #16, check/build CI38180969695/job114593253417 aprovado (596 unitários/47 arquivos e43 scripts), checkout0cb19ffdc2b7798582467a06d9629d637cc16d71/pais conferidos. Quatro módulos somente servidor/135 testes próprios, revisões sem bloqueador; sem driver/banco/operação financeira. docs/evidencias/pagamentos/contratos/README.md
- [x] M3.01e Implementar o adaptador do Asaas com porta de transporte — evidência: fonte58f61cf291295672e8fa5c75d0cd1fa4b35a6893/PR #17, check/build CI38182349916/job114597378029 aprovado (732 unitários/49 arquivos e43 scripts), checkout3d803ab3b5083348dc2dad0f7cbe8be19ff4ac25/pais conferidos. Porta fixture explícita,136 casos novos, duas revisões sem bloqueador; sem driver/segredo/HTTP/banco/efeito financeiro. docs/evidencias/pagamentos/transporte/README.md
- [x] M3.01f Normalizar os eventos financeiros do Asaas — evidência: fonte3dabd4dd888749f2dd0398fc2af0e85d5266083f/PR #18, check/build CI38183836577/job114601844053 aprovado (878 unitários/50 arquivos e43 scripts), checkout52650030f80793a5a4291af4504a3c5577dab10d/pais conferidos. 146 próprios/presença/fatos/reconciliação/comparação cumulativa, sem delta/efeitos; duas revisões finais sem bloqueador. docs/evidencias/pagamentos/eventos/README.md
- [ ] M3.01b Persistir cobranças e reconciliar respostas do provedor — escopo aprovado desdobrado antes da implementação em M3.01g/h/i/j/k; parent permanece aberto até as cinco partes verificadas
- [x] M3.01g Preparar obrigações e vínculos do provedor — preparo/verificação local concluídos; evidência: fonte86895f48d911c1f6365ca3a0461aaff6cb4e4c33/PR #19, migration0058, 50 unitários e19 banco próprios/403 gerais, advisors sem achados, duas revisões e check/build CI38185910157/job114608059274 aprovado com928 unitários/51 arquivos e43 scripts; sem emissão
- [x] M3.01h Persistir intenções, reservas e recibos — preparo/verificação local concluídos; evidência: partes M3.01l/m verificadas nas fontes7daef30d/43e5096, migrations0059/0060, PRs #20–21; check/build remoto aprovado em ambas,24+20 casos próprios de banco e43+6 unitários, concorrência/rollback/replay, advisors e revisões sem bloqueador; duas jornadas375/1440 verificadas. Sem despacho ou operação de pagamento real
- [x] M3.01l Persistir reserva, intenção e replay — preparo/verificação local concluídos; evidência: fonte7daef30d5d1f341f08cc0717074961559f433f18/PR #20, migration0059,43 unitários e24 banco próprios/427 gerais, advisors e duas revisões sem bloqueador; check/build CI38187868946/job114614038683 aprovado com971 unitários/52 arquivos e43 scripts; sem despacho/crédito
- [x] M3.01m Coordenar reservas com Pix manual e contrato — preparo/verificação local concluídos; evidência: fonte43e5096bacd383b5628ca9c31c5e956897ab7148/PR #21, migration0060,6 unitários e20 banco próprios/447 gerais,63 focados finais, dois navegador375/1440 comAxe, advisors e duas revisões sem bloqueador; check/build CI38189462022/job114618881288 aprovado com977 unitários/53 arquivos e43 scripts; docs/evidencias/pagamentos/coordenacao/README.md
- [x] M3.01i Executar emissão e conciliação fictícias de forma retomável — preparo/verificação local concluídos nas partes n/o/p; evidência: fontesce6c3a2/d378896/b2cab864/9272dbd/924a171, PRs #22–26 e migrations0061–0067. Transporte durável/cliente/autorização/observação/prova de não despacho/jornada integrais verificados,591 banco/1102 unitários/43 scripts,advisors/read-back limpo e revisões sem bloqueador. Check/build final S aprovado; geral remota S viva. Operações reais, crédito J/fatura K/parentb/M3.01 abertas
- [x] M3.01n Persistir o transporte interno e o provedor fictício — preparo/verificação local concluídos; evidência: fonte ce6c3a211bee3110387664a345774a835a869d87/PR #22, migration0061,34 unitários e25 banco próprios/472 gerais em27 arquivos, novo processo recupera recibo, advisors e duas revisões sem bloqueador. Check/build CI38191659515/job114625508727 aprovado com1011 unitários/54 arquivos e43 scripts; CI38191659515 integralmente aprovado:472 banco/27 arquivos,167 navegador/sete omissões e advisors sem achados; fonte preservada. I/O/P continuam abertos. docs/evidencias/pagamentos/provedor-ficticio/README.md
- [x] M3.01o Criar e conferir o vínculo do cliente de forma retomável — preparo/verificação local concluídos; evidência: fonte d378896e7af3909c9243b1bc41d8017fd09385e4/PR #23, migration0062,19 unitários e25 banco próprios/497 gerais em28 arquivos, jornada sem binding atéG, processo distinto e fencing. Advisors/read-back limpo e duas revisões sem bloqueador. CI38193268625 integralmente aprovado: 1030 unitários/55 arquivos, 43 scripts/check/build, 497 banco/28 arquivos, 167 navegador/sete omissões planejadas e dois advisors sem achados; PR pronto para revisão/fonte preservada. I/P/parentb abertos; docs/evidencias/pagamentos/vinculo-cliente/README.md
- [x] M3.01p Executar e reconciliar a cobrança com claim permanente — preparo/verificação local concluídos nas partes q/r/s; evidência: fontesb2cab864/9272dbd/924a171 e PRs #24/#25/#26, autorização/transporte/observação/resolução e jornada sem binding até nova emissão verificadas. Check/build das três fontes aprovado; q/r com CI integral, geral remota S em execução/head preservado. Claim e reservas protegidos, sem crédito/ops reais; projeção J continua aberta
- [x] M3.01q Preparar run e autorização consumível de emissão — preparo/verificação local concluídos; evidência: fonte b2cab864e38647a698ff0ae8c5d30901211b9dcb/PR #24, migration0063,29 unitários e20 banco próprios/517 gerais em29 arquivos, run/start/retirada/concorrência/rollback e guardas metadata. Advisors/read-back e duas revisões sem bloqueador. CI38194478429 integralmente aprovado: 1059 unitários/56 arquivos, 43 scripts/check/build, 517 banco/29 arquivos, 167 navegador/sete omissões planejadas e dois advisors sem achados; PR pronto para revisão/fonte preservada. Não executa transporte/resolução; r/s/p/i abertos. docs/evidencias/pagamentos/inicio-execucao/README.md
- [x] M3.01r Emitir e observar cobrança pela porta durável — preparo/verificação local concluídos; evidência: fonte9272dbd2084295e28ba23090dba45bd5280d3250/PR #25, migration0064,24 banco próprios/541 gerais em30 arquivos,8 novos unitários/1067 gerais em56 arquivos e43 scripts; processo distinto, perda/duplicatas/divergências/fencing/replay/rollback/grants. Advisors/read-back limpo e duas revisões sem bloqueador. CI38196795022 integralmente aprovado:1067 unitários/56 arquivos,43 scripts/check/build,541 banco/30 arquivos,167 navegador/sete omissões planejadas e dois advisors sem achados; PR pronto para revisão/fonte preservada. Não aplica crédito nem libera reserva; S/P/I abertas. docs/evidencias/pagamentos/transporte-observacao/README.md
- [x] M3.01s Resolver despacho comprovado e integrar retomada — preparo/verificação local concluídos; evidência:fonte924a17102ae1e608ea14c574b0fe258871d85849/PR #26,0065/0066/0067,50 próprios/591 banco em31 arquivos,35 novos unitários/1102 gerais em57 arquivos e43 scripts. Journal/terminal/liberação exata/retirada versusN/replay/aliasUUID/globalhistory/jornada nova emissão verificados; advisors/read-back e duas revisões sem bloqueador. Check/build CI38199725409/job114650224889 aprovado; geral remota viva/PR rascunho/head preservado. Sem crédito/ops reais; J/K/parentb/M3.01 abertas. docs/evidencias/pagamentos/resolucao-despacho/README.md
- [ ] M3.01j Preservar histórico e unificar projeção de crédito — parte de M3.01b; manual/Asaas sem dupla contagem, parcial/estorno/chargeback, sinal/fila/saldo/download/auditoria/avisos; desdobrada antes do código em t→u→v, parent aberto até as três partes verificadas
- [x] M3.01t Registrar observações e provas financeiras duráveis - preparo/verificação local; evidência: fonte 4559f4d/PR #27, migrations 0068-0073, 30 próprios/621 gerais de banco, 1138 unitários/43 scripts, CI38201931012 integralmente aprovado:621 banco/32 arquivos,167 navegador/sete omissões e dois advisors sem achados; journal R/N, consultas independentes, conflito durável e prova fictícia de chargeback; sem aplicação de crédito. U/V continuam necessárias e ativação real permanece condicionada.
- [x] M3.01u Aplicar posição cumulativa e projeção comum — preparo/verificação local concluídos comW/X,escopo original preservado;protocolo financeiro/recibos/efeitos/concorrência/rollback/estorno tardio e jornada real verificados — evidência: fonte e792553a0547fdda45af664841b31928b77cf79d/PR33,CI38232179008/job114754059279 check/build success:1284 unitários/62 arquivos/43 scripts/sete páginas;checkout9c05a10f1bc4b54063b457d013222d2ba18a1ffd/pais main9a25+fonte/head conferidos,extrato88b89c0d262202b1f379c9fd3ec8283a21107f554d1934675063f38a38d05a2f;798 banco e seis navegador locais/read-back/advisors/QA;consumidoresV continuam obrigatórios antes deJ eparents
- [x] M3.01w Consolidar motor e projeção financeira cumulativa - preparo/verificação local concluídos; evidência: fonte303b47757364d2d98f441324547672d4d7115ca8/PR #28, migrations0074–0077,51 unitários e33 banco próprios/63 focados finais após0077,653 gerais até0076,advisors/read-back/revisões sem bloqueador; check/build CI38205949733/job114669363566 aprovado. Sem writer/efeitos/resolução; X/U/J/V/parentb/M3.01 seguem abertos
- [x] M3.01x Aplicar créditos e resolver cobranças transacionalmente — preparo/verificação local concluídos comY/Z/AA,escopo original preservado;protocolo financeiro/recibos/efeitos/concorrência/rollback/estorno tardio e jornada real verificados — evidência: fonte e792553a0547fdda45af664841b31928b77cf79d/PR33,CI38232179008/job114754059279 check/build success:1284 unitários/62 arquivos/43 scripts/sete páginas;checkout9c05a10f1bc4b54063b457d013222d2ba18a1ffd/pais main9a25+fonte/head conferidos,extrato88b89c0d262202b1f379c9fd3ec8283a21107f554d1934675063f38a38d05a2f;798 banco e seis navegador locais/read-back/advisors/QA;consumidoresV continuam obrigatórios antes deJ eparents
- [x] M3.01y Aplicar posição e efeitos financeiros atomicamente - preparo/verificação local concluídos; evidência: fonte55164faa3a207e8abb98ead7da56365f63d53238/PR #29,migrations0078–0084,36 banco próprios finais/688 gerais até0082,1195 unitários/60 arquivos e43 scripts,14 navegador375/1440 comAxe/capturas/QA,advisors/read-back/revisões sem bloqueador; check/build CI38210168644/job114682336319 success. Reserva/run preservados; X/Z/AA/U/J/V/parentb continuam abertos
- [x] M3.01z Resolver cobranças por provas financeiras — preparo/verificação local concluídos comAB/AC;guardas/journal distinto de S/terminal/fencing/liberação exata/views/claim preservado/estorno após reserva posterior verificados — evidência: fontes adbb506/f611607,PRs #30/#31,CI de check/build e747 testes locais de banco;AA/V continuam obrigatórias
- [x] M3.01ab Proteger novos pagamentos com projeção comum — evidência:fonteadbb506/PR #30,717 banco/35 arquivos e46 focados/27 próprios;check/build CI38213748801/job114693572820 success,1196 unitários/43 scripts/advisors e read-back sem achados. Sem terminal/liberação;AC/AA/V e parents abertos;CI geral vivo/head preservado
- [x] M3.01ac Resolver financeiramente run e verificar proteção terminal — preparo/verificação local concluídos;30 próprios/747 gerais de banco,advisors/read-back87/25/53 comRLS,recibos/claim/reserva posterior intactos — evidência: fonte f611607,PR #31,check/build CI38219444567/job114711884457 success com1237 unitários/61 arquivos/43 scripts;CI integral remoto38219444567 success:747 banco/179 navegador/sete omissões/advisors sem achados;head preservado
- [x] M3.01aa Vincular legado com prova e verificar aplicação integral — preparo/verificação local concluídos comAD/AE,escopo original preservado;protocolo financeiro/recibos/efeitos/concorrência/rollback/estorno tardio e jornada real verificados — evidência: fonte e792553a0547fdda45af664841b31928b77cf79d/PR33,CI38232179008/job114754059279 check/build success:1284 unitários/62 arquivos/43 scripts/sete páginas;checkout9c05a10f1bc4b54063b457d013222d2ba18a1ffd/pais main9a25+fonte/head conferidos,extrato88b89c0d262202b1f379c9fd3ec8283a21107f554d1934675063f38a38d05a2f;798 banco e seis navegador locais/read-back/advisors/QA;consumidoresV continuam obrigatórios antes deJ eparents
- [x] M3.01ad Registrar origem fictícia durável e vincular legado — preparo/verificação local concluídos;36 próprios/783 gerais de banco,advisors/read-back88/25/55 comRLS,imutabilidade/replay/fila/históricos verificados — evidência: fontefe55a63/PR32/check-build CI38223644784/job114725721665 success:1284 unitários/62 arquivos/43 scripts;CI38223644784 falhou timeout5000;correção a818eef/CI38227632215 integral success:783 banco/179 navegador/sete omissões/advisors sem achados;AE/AA/parents abertos
- [x] M3.01ae Verificar jornada integral de legado/aplicação/resolução — preparo/verificação local concluídos:15 próprios/798 gerais de banco em38 arquivos,seis navegador375/1440 comAxe/30 capturasQA+dois retakes;read-back/controles restaurados exatamente/advisors sem achados — evidência: fonte e792553a0547fdda45af664841b31928b77cf79d/PR33,CI38232179008/job114754059279 check/build success:1284 unitários/62 arquivos/43 scripts/sete páginas;checkout9c05a10f1bc4b54063b457d013222d2ba18a1ffd/pais main9a25+fonte/head conferidos,extrato88b89c0d262202b1f379c9fd3ec8283a21107f554d1934675063f38a38d05a2f;CI38232179008 integral success:798 banco/185 navegador/sete omissões/advisors sem achados;PR33 pronta/head preservado;V/J/parents abertos
- [ ] M3.01v Integrar consumidores e jornada financeira — parte de j, depende de u; sinal/contrato/upload/fila/saldo/download/UI, snapshots históricos e jornadas375/1440; desdobrada antes do código emaf/ag/ah/ai,escopo original integral preservado e quatro partes obrigatórias
- [x] M3.01af Integrar leituras financeiras atuais e apresentação — evidência:fonte81b7026/PR37/CI38269491889 success,check/build1303/64/43,banco836/40,navegador191/7,dois advisors,cleanup/upload,checkoutd6ba5b9/pais/head/extratos nativos conferidos. Preparo/verificação local,sem completarAH/AI/V/J/parents ou ativar operação real
- [x] M3.01ag Integrar contrato e upload às fontes financeiras — preparo/verificação local concluídos;22 próprios/836 gerais banco/40 arquivos,10 navegador375/1440/Axe/dez capturasQA,advisors/read-back90/25/55RLS/controles e identidades restaurados — evidência: fonte d25fed7/PR35/check-build CI38253724198/job114826278059 success com1293 unitários/43 scripts;checkout/pais/head conferidos. Geral cancelada porregressões herdadas deAF;AJ obrigatória antes deV/J/AH/AI
- [x] M3.01aj Corrigir regressões gerais dos consumidores financeiros — evidência:fonte81b7026/PR37/CI38269491889 success,check/build1303/64/43,banco836/40,navegador191/7,dois advisors,cleanup/upload,checkoutd6ba5b9/pais/head/extratos nativos conferidos. Preparo/verificação local,sem completarAH/AI/V/J/parents ou ativar operação real
- [x] M3.01ak Assegurar limpeza da fixture de download privado — evidência:fonte81b7026/PR37/CI38269491889 success,check/build1303/64/43,banco836/40,navegador191/7,dois advisors,cleanup/upload,checkoutd6ba5b9/pais/head/extratos nativos conferidos. Preparo/verificação local,sem completarAH/AI/V/J/parents ou ativar operação real
- [x] M3.01al Ajustar duração do CI após execução sem falhas — evidência:fonte81b7026/PR37/CI38269491889 success,check/build1303/64/43,banco836/40,navegador191/7,dois advisors,cleanup/upload,checkoutd6ba5b9/pais/head/extratos nativos conferidos. Preparo/verificação local,sem completarAH/AI/V/J/parents ou ativar operação real
- [ ] M3.01ah Integrar entrega e autorização de arquivos à projeção — parte dev,depende deag;regra pura/SQL/DTOs concordantes,política capturada porentrega,certeza porfase,links/URLs/bytes/auditoria,sem decidirD6 real
- [ ] M3.01ai Verificar jornadas financeiras dos consumidores — parte dev,depende deaf/ag/ah;parcial/conciliação/refund/saldo/contrato/both políticas fictícias,reservas/recibos históricos/concorrência,375/1440/Axe/capturas/download auditado/isolamento
- [ ] M3.01k Mostrar fatura autenticada e verificar jornada — parte de M3.01b; proprietário/reconciliação, 375/1440 px e reenvio/rollback locais
- [ ] M3.01c Processar webhooks e verificar a jornada em sandbox — parte de M3.01; autenticação, replay e liberação pelas regras do pedido
- [ ] M3.02 Criar o botão do André para ligar ou desligar o pagamento automático — RF-31
- [ ] M3.03 Ativar o Asaas em produção — conta conforme D9; aprovação do Fábio

### Proposta, contrato e garantia

- [ ] M3.04 Gerar o contrato em PDF no aceite — RF-30
- [ ] M3.05 Publicar e aplicar a política de garantia e reembolso do sinal — RF-36 e D5
- [ ] M3.06 Criar o pedido de revisão dentro da garantia — RF-63
- [ ] M3.07 Permitir ajuste manual do orçamento com motivo — RF-26

### Assinatura e entrega

- [ ] M3.08 Validar automaticamente a assinatura ICP-Brasil do parecer — RF-62 e D6
- [ ] M3.09 Cobrar o saldo na entrega conforme a regra de liberação — RF-35 e D6

### Recorrência no mesmo processo

- [ ] M3.10 Criar a nova versão do PDF quando o processo volta, com as páginas já lidas marcadas — RF-46
- [ ] M3.11 Criar o pedido de atualização sobre o .PJC guardado — reaproveita checklist, índice e decisões
- [ ] M3.12 Reaproveitar a confirmação de acordo nas decisões técnicas e verificar a recorrência — RF-47 já implementado em M2.23; não duplicar confirmação nem transportar concordância para conteúdo novo

### Aquisição e medição

- [ ] M3.13 Instalar o GA4 com banner de consentimento e o Search Console — RF-04; o André quer ver a origem por estado e cidade
- [ ] M3.14 Criar o simulador público de orçamento sem cadastro — RF-03
- [ ] M3.14a Preparar simulador público com preços versionados — ⏳ implementação/SQL91 somente local,1321/65 unitários/43 scripts/cinco banco/oito navegador/Axe/QA/32 regressões/read-back/advisors conferidos. Suíte geral local198/7/uma falha de retorno pendente;diagnóstico duas passagens sem alterar espera e teste original restaurado. Build localEPERM;check/build/CI geral dafonte final pendentes. Campos/textos/tabela comerciais continuam aguardandoAndré;M3.14 permanece aberta
- [ ] M3.15 Mostrar os indicadores no painel do André — RF-83
- [ ] M3.16 Criar a avaliação depois da entrega e o convite para avaliar no Google — RF-64
- [ ] M3.17 Pré-preencher dados do processo pelo número via DataJud — tribunal, vara, classe e movimentos

### LGPD e confiança

- [ ] M3.18 Criar o contrato de operador de dados e aplicar a política de retenção por job — D8
- [ ] M3.19 Ativar MFA para o André e a administração
- [ ] M3.20 Mostrar ao André o registro de acessos a arquivos — RN-11
- [ ] M3.21 Ativar WhatsApp oficial para clientes com consentimento — RF-72 e D7
- [ ] M3.22 Copiar os arquivos do Storage para fora do Supabase e testar uma restauração — o backup diário do Supabase cobre o banco; conferir se cobre os arquivos

### Pesquisa de mercado

- [ ] M3.23 Entrevistar de 10 a 15 advogados de SP e MG sobre dores, prazos e preço — responsável: André e Fábio; o agente prepara o roteiro e consolida as respostas
- [ ] M3.24 Fazer cliente oculto em três concorrentes — responsável: Fábio; Office Perícia, MH Cálculos e Lagares; registrar preço, prazo e experiência

### Passagem para o cliente

- [ ] M3.25 Escrever o manual do dono — onde está cada conta, quanto custa por mês, como trocar senha e 2FA, quem chamar em caso de problema
- [ ] M3.26 Entregar ao André a conta-mãe e os acessos de produção — senha e 2FA; o André confirma que é dono no Supabase, na Vercel, no Resend e no domínio; aprovação do Fábio
- [ ] M3.27 Trocar as chaves de produção depois da passagem — rotação em cada serviço e atualização das variáveis da Vercel
- [ ] M3.28 Definir o destino do repositório — transferir para uma conta ou organização do cliente, ou manter na Harmony para manutenção (D15)

### 🔒 GATE M3 (aprovação do Fábio e do André)

- [ ] Sinal confirmado automaticamente pelo webhook do Asaas em produção
- [ ] Primeiros pedidos reais pagos e entregues no prazo
- [ ] Indicadores de conversão disponíveis no painel
- [ ] Decisão registrada sobre seguir para a fase operacional com IA

## M4 — Operacional 1: leitura do processo com IA

Prazo sugerido: a definir depois do GATE M3

### Planejamento do marco

- [ ] M4.00 Detalhar as tarefas do M4 na especificação e pedir aprovação do Fábio — carregar antes a skill claude-api; incluir a decisão sobre a execução dos jobs longos

### Acervo e gabarito

- [ ] M4.01 Reunir de 20 a 30 casos antigos do André com processo, cálculo final e parecer — responsável: André; autorização dos clientes ou anonimização
- [ ] M4.02 Montar o gabarito de cada caso com índice de páginas e parâmetros corretos — feito com o André; base da medição de acurácia
- [ ] M4.03 Fechar a política de dados da IA — confirmar a retenção na Anthropic, pedir retenção zero, atualizar a política de privacidade sobre transferência internacional

### Ingestão e triagem

- [ ] M4.04 Escolher e montar a execução de jobs longos para processar PDFs fora da requisição — opções: Vercel Workflow ou Queues, Supabase Edge Functions ou worker dedicado na conta do cliente; decisão registrada; reprocessamento seguro
- [ ] M4.05 Separar páginas, extrair texto e detectar páginas escaneadas — RF-91; pdfjs-dist
- [ ] M4.06 Detectar páginas duplicadas e repetidas — RF-92; hash de texto e hash perceptual
- [ ] M4.07 Classificar as páginas e propor o índice de páginas para o André confirmar — RF-93; triagem local antes de qualquer chamada à IA

### Extração de parâmetros

- [ ] M4.08 Extrair parâmetros da sentença e do acórdão com página e trecho por campo — RF-94; `claude-opus-5-5` com saídas estruturadas
- [ ] M4.09 Criar a tela de validação campo a campo que grava a decisão técnica — RF-94 e RF-44
- [ ] M4.10 Criar o teto de custo por processo e por mês com registro de uso

### Qualidade da IA

- [ ] M4.11 Medir a acurácia por campo no acervo e mostrar no painel de qualidade — RF-95; meta por campo combinada com o André

### 🔒 GATE M4 (aprovação do Fábio e do André)

- [ ] O índice de páginas proposto atinge a meta de acerto combinada no acervo
- [ ] Cada parâmetro extraído mostra a página e o trecho de origem
- [ ] O custo por processo foi medido e está dentro do teto
- [ ] O André aprova o uso em pedidos reais

## M5 — Operacional 2: cartões de ponto, regras e parecer

Prazo sugerido: a definir depois do GATE M4

### Planejamento do marco

- [ ] M5.00 Detalhar as tarefas do M5 na especificação e pedir aprovação do Fábio — incluir o layout de importação do PJe-Calc confirmado

### Cartões de ponto

- [ ] M5.01 Confirmar o layout de importação de cartão de ponto na versão vigente do PJe-Calc — manual oficial e teste com o André
- [ ] M5.02 Ler cartões de ponto, inclusive manuscritos, para tabela com confiança por célula — RF-96
- [ ] M5.03 Validar os horários com regras e criar a tela de conferência com as células duvidosas destacadas — RF-96
- [ ] M5.04 Exportar o CSV de importação do PJe-Calc e testar a importação com o André — RF-96

### Regras de juros e correção

- [ ] M5.05 Catalogar com o André as modulações de juros e correção que ele usa, com a fonte legal — ele citou mais de oito
- [ ] M5.06 Criar o motor de regras determinístico e versionado com testes — RF-97; ADC 58 e 59, Lei 14.905/2024 e modulações do André
- [ ] M5.07 Sugerir a modulação pela IA a partir do texto da decisão, com escolha do André — RF-97

### Parecer

- [ ] M5.08 Definir com o André o modelo de parecer enxuto — seções fixas
- [ ] M5.09 Gerar o rascunho do parecer com as decisões e as páginas de origem — RF-98

### Ganho de capacidade

- [ ] M5.10 Medir o tempo por cálculo antes e depois — meta: dobrar a capacidade do André

### 🔒 GATE M5 (aprovação do Fábio e do André)

- [ ] O CSV de cartão de ponto é importado no PJe-Calc sem erro nos casos de teste
- [ ] O motor de regras reproduz os cálculos do acervo dentro da tolerância combinada
- [ ] O tempo médio por cálculo caiu de forma medida

## M6 — Mercado

Prazo sugerido: a planejar

### Planejamento do marco

- [ ] M6.00 Detalhar as tarefas do M6 na especificação e pedir aprovação do Fábio

### Canais

- [ ] M6.01 Propor convênio à CAADF e às Caixas de Assistência de SP e MG — modelo do desconto da Jusfy; aprovação do Fábio e do André antes de qualquer contato
- [ ] M6.02 Preparar palestra técnica para ESA ou comissão da OAB — Lei 14.905, ADC 58 e PJe-Calc; publicidade técnica conforme o CFC

### Produto

- [ ] M6.03 Incluir as áreas cível e previdenciária no checklist
- [ ] M6.04 Criar contas de escritório com vários usuários — RF-13
- [ ] M6.05 Estudar a abertura para outros calculistas
- [ ] M6.06 Investigar a geração direta do arquivo .PJC — RF-99

## Especificação das tarefas

<!-- hub: ignorar -->

**Como ler cada especificação:**
- "Fazer" lista os passos na ordem.
- "Pronto quando" é o critério de aceite; a evidência vai no item da tarefa.

**Valem para todas as tarefas:**
- **Código:**
  - fica em `app/`;
  - identificadores de código, tabelas e colunas em inglês;
  - textos de tela em português.
- **Segredos:** comandos que precisam deles rodam por `scripts/com-segredos.sh` (depois de M1.22).
- **Next.js 16:** ler antes as regras do Hub em `../Sistema de Gestão da Harmony Digital/app/AGENTS.md`. Exemplo: o `middleware.ts` virou `proxy.ts`.
- **Skills:**
  - `vercel:nextjs` para dúvidas de Next.js;
  - `frontend-design` para telas;
  - `claude-api` para qualquer código que chame o Claude.
- **Testes de tela:** em 375 px e 1440 px, com axe sem violações.
- **Ferramentas de linha de comando deste Mac que estão em outras contas:** a CLI da Vercel está logada em `agencialivestyle-3174` e a CLI do Supabase em outra conta (o projeto do cliente não aparece nela). Não usar `vercel` sem `--token` do cliente, nem `supabase link`, `db push` ou outro comando de nuvem. `supabase start` é local e pode ser usado.

### M1 — Fundação técnica

#### M1.03 Aprovar os MCPs e fazer o login (Fábio)

- **Fazer:**
  1. Abrir uma sessão nova do Claude Code ou do Codex nesta pasta.
  2. Aprovar `andre-calculos-supabase` e `andre-calculos-vercel` quando aparecer o aviso.
  3. No Claude Code, autenticar os dois em `/mcp`; se não aparecer na extensão do VS Code, rodar `claude` no terminal integrado. No Codex, usar `codex mcp login <nome-dedicado>` e conferir autenticação/descoberta pelo cliente oficial.
  4. No navegador, entrar com a conta nova do cliente, usando uma janela anônima ou um perfil separado.
- **Pronto quando:** os dois aparecem como conectados no `/mcp` do Claude Code, ou o Codex confirma OAuth e descobre suas ferramentas. A identidade e o acesso aos recursos são verificados separadamente em M1.04.

#### M1.04 Conferir os dois MCPs e registrar os identificadores

- **Fazer:**
  1. No `andre-calculos-supabase`, chamar `get_project_url`. Precisa responder `https://qtofwbxujshroaafxowr.supabase.co`.
  2. No `andre-calculos-vercel`, chamar `list_teams`. Precisa listar só o time do cliente; anotar o slug e o id.
  3. Gravar `VERCEL_TEAM`, `VERCEL_TEAM_ID` (e `SUPABASE_ORG`, se aparecer) em `scripts/contas-esperadas.env` e na tabela do `AGENTS.md` §7. Identificadores fornecidos pelo Fábio/conferidos no navegador são valores esperados; não substituem a leitura pelo MCP.
  4. Rodar `bash scripts/preflight.sh`.
- **Pronto quando:** os dois MCPs respondem com as contas do cliente e o preflight mostra os valores registrados.
- **Se der errado:** se aparecer projeto ou time de outro cliente, parar e pedir ao Fábio para refazer o login (M1.03).

#### M1.05 Confirmar região e plano (Fábio confirma, agente registra)

- **Fazer:**
  1. O Fábio confere no painel do Supabase a região (esperada: South America, São Paulo) e o plano (esperado: Pro). Na Vercel, confere o plano (esperado: Pro).
  2. Se o projeto do Supabase estiver fora de São Paulo, decidir antes de criar tabelas: recriar o projeto (está vazio) ou seguir assim.
  3. O agente registra região e plano no Registro de Execução e no `PRD.md` §11.2.
- **Pronto quando:** região e planos estão registrados.

#### M1.06 Confirmar a conta-mãe (Fábio)

- **Fazer:**
  1. Confirmar que Supabase e Vercel foram criados com o Gmail novo do cliente.
  2. Ativar 2FA por app autenticador e pôr o celular e o e-mail do André como recuperação.
  3. Guardar o login no cofre só de pessoas (D14).
- **Pronto quando:** o Fábio confirma.

#### M1.07 Conta no Resend (Fábio)

- **Fazer:**
  1. Criar a conta com a conta-mãe.
  2. Gerar uma chave de API de envio para desenvolvimento e guardar no cofre `proj-andre-calculos`: item "Resend", campo `RESEND_API_KEY`.
- **Pronto quando:** o item existe no cofre.

#### M1.08 Instalar OrbStack ou Docker Desktop (Fábio)

- **Fazer:**
  1. Instalar o OrbStack (recomendado no Mac por ser leve: `brew install --cask orbstack`) ou o Docker Desktop.
  2. Abrir o app uma vez.
- **Pronto quando:** `docker info` responde no terminal.

#### M1.10 Tirar o áudio do primeiro commit (Fábio decide, agente executa)

- **Fazer** (só com o ok do Fábio):
  1. Conferir a autorização, a identidade GitHub e que o remoto continua vazio; registrar hash e tamanho do arquivo local.
  2. Em cópia bare local temporária, filtrar somente `PROJETO DO ANDRE THE ONE.m4a` de todos os commits de `main` e `feat/fundacao-portal`. Amend do HEAD não é suficiente depois de commits descendentes.
  3. Validar autores, datas, mensagens, ancestralidade e todos os arquivos restantes de cada commit. Retirar somente o áudio das árvores de snapshot `refs/codex/turn-diffs`, usando índice temporário e conservando os outros arquivos. Importar somente as referências filtradas e atualizar as referências esperadas atomicamente, sem maintenance/GC.
  4. Remover o caminho só do índice original, sem checkout/reset; conferir hash/tamanho do original, `.gitignore` e ausência do áudio em todas as referências alcançáveis.
- **Observação:** o arquivo continua na pasta e o `.gitignore` já ignora `*.m4a`.
- **Pronto quando:** `git log --all -- "PROJETO DO ANDRE THE ONE.m4a"` e `git ls-files` desse caminho estão vazios; o blob do áudio não aparece em `git rev-list --objects --all`; o original conserva hash/tamanho e nenhuma referência de backup será enviada ao GitHub.

#### M1.10a Retirar a transcrição antes da publicação autorizada

- **Fazer**, conforme a autorização do Fábio:
  1. Registrar tamanho/SHA-256 do original local e conferir a conta GitHub, o ID do repositório e os SHAs remotos.
  2. Em cópia bare temporária, filtrar os dois caminhos exatos da transcrição, incluindo seu nome antigo. Comparar os demais arquivos e metadados de todos os commits; conferir também as árvores de snapshot do Codex. Trocar referências atomicamente, sem importar backups, fazer checkout/reset ou apagar o original.
  3. Atualizar o remoto privado usando lease com o SHA anterior explícito e consultar se os commits antigos continuam acessíveis pelo cache.
  4. Se houver cache privado, inventariar os vínculos antes de separar a publicação: conservar o antigo privado e arquivado e criar um repositório independente, inicialmente privado, no mesmo endereço. Não excluir repositórios nem transferir acessos ou integrações sem verificar seu escopo.
  5. Conferir um clone remoto e a ausência dos caminhos/blobs privados antes de tornar público. Verificar acesso anônimo ao novo destino e HTTP 404 para os conteúdos antigos; registrar os IDs e o mapa de SHAs.
- **Limite da evidência:** a ausência no histórico publicado não equivale à purga física dos caches antigos pelo GitHub. Registrar essa limitação; contato com suporte exige autorização para enviar a mensagem.
- **Pronto quando:** caminhos e blobs privados ausentes de todas as referências e do clone publicado; original local com hash/tamanho idênticos e ignorado; arquivo antigo permanece privado, se necessário, com as consultas anônimas negadas.

#### M1.11 Organizar a pasta do projeto

- **Fazer:**
  1. Organizar a transcrição em `docs/transcricao-reuniao-2026-10-10.md`, preservando o conteúdo original.
  2. Organizar o relatório em `docs/pesquisa/reports/` e as notas em `docs/pesquisa/research_notes/`; preservar os arquivos e incluir caminhos explícitos no commit.
  3. Criar um `README.md` curto: o que é o projeto, como rodar (apontar para o `AGENTS.md`) e a estrutura de pastas.
  4. Atualizar os caminhos citados em `AGENTS.md` (§2 e §11), `PRD.md` (cabeçalho) e neste plano.
  5. Commit.
- **Pronto quando:** nenhum link local quebrado; conferir os destinos relativos em `AGENTS.md`, `PRD.md`, `plan.md`, `README.md` e `docs/`.

#### M1.12 Primeiro push

- **Fazer:**
  1. Rodar o preflight.
  2. `export GH_TOKEN="$(gh auth token --user fabioalmeidadigital)"`.
  3. `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin main`.
- **Observação:** o primeiro push vai direto para a `main`. Depois, só por PR.
- **Pronto quando:** `gh repo view Harmony-Digital/andre-calculos` mostra o SHA do último commit.

#### M1.13 CI de qualidade e proteção da main

- **Fazer:**
  1. Criar `.github/workflows/qualidade.yml`:
     - roda em `pull_request` e em `push` para a `main`;
     - Node 22, `working-directory: app`;
     - `npm ci` e `npm run check`.
  2. Tentar proteger a `main`, exigindo PR e o CI verde, com `gh api` (rulesets).
  3. Se o plano da organização não permitir isso em repositório privado, registrar no Registro de Execução e manter a regra de processo do `AGENTS.md` §4.
- **Pronto quando:** um PR mostra os checks reais `qualidade` e `e2e` verdes, e a consulta da API confirma as regras efetivas da `main`.

#### M1.21 Itens do cofre (Fábio)

- **Fazer:** a cada serviço configurado, criar um item no cofre certo (D14), com os campos no nome da variável (`PRD.md` §11.7).
- **Pronto quando:** essa tarefa fica aberta até o M2. Marcar quando todos os serviços do M2 estiverem no cofre.

#### M1.22 app/.env.tpl e scripts/com-segredos.sh

- **Fazer:**
  1. Criar `app/.env.tpl` com as variáveis do `PRD.md` §11.7 que já existem:
     - segredos como referência `op://proj-andre-calculos/<Item>/<CAMPO>`;
     - valores públicos e locais (como a URL do Supabase local) escritos direto.
  2. Criar `scripts/com-segredos.sh`:
     - lê o token com `security find-generic-password -a "$USER" -s op-sa-andre-calculos-agente -w`, só dentro do script;
     - exporta `OP_SERVICE_ACCOUNT_TOKEN`;
     - entra em `app/` e roda `exec op run --env-file=.env.tpl -- "$@"`.
  3. Criar `scripts/dev-env.sh`, que captura internamente `supabase status -o json`, confirma a URL local exata e injeta as chaves apenas no ambiente do processo. Não grava `.env.local` nem imprime valores (AGENTS §7.1).
  4. Documentar o uso no README: `scripts/com-segredos.sh npm run dev`.
- **Pronto quando:** `scripts/com-segredos.sh npm run dev` sobe o app, e nenhum valor de segredo aparece no repositório nem na saída.

#### M1.23 Variáveis de produção na Vercel (Fábio; agente prepara)

- **Fazer:**
  1. O agente cria `docs/variaveis-producao.md` com a lista de nomes, o item no cofre e o ambiente (production ou preview) de cada variável.
  2. O agente cria `scripts/sincronizar-vercel.sh`, que o Fábio roda com a conta dele no 1Password e o token da Vercel do cliente, usando `vercel env add`.
  3. O Fábio roda o script.
- **Pronto quando:** `/api/health` em produção responde e as funções que dependem das variáveis funcionam.

#### M1.24 Segredos no CI

- **Fazer:** só se algum job precisar de segredo. Usar `1password/load-secrets-action` com uma conta de serviço própria do CI (o Fábio cria). Se nenhum job precisar, marcar como "não necessário" com a data.
- **Pronto quando:** o job roda sem segredo exposto, ou a tarefa está registrada como não necessária.

#### M1.30 Criar o app Next.js 16.4

- **Fazer:**
  1. Na raiz: `npx create-next-app@16.4.0 app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`.
  2. Dentro de `app/`: `npx shadcn@latest init`, com cor base neutra.
  3. Instalar como desenvolvimento: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `prettier`, `@playwright/test`, `@axe-core/playwright`. Depois, `npx playwright install chromium`.
  4. Instalar `server-only`, `zod` e `pino`.
  5. Criar no `package.json` os scripts do Hub: `dev`, `build`, `start`, `lint`, `typecheck` (`next typegen && tsc --noEmit`), `test` (`vitest run`), `e2e` (`playwright test`), `format`, `format:check` e `check` (format:check, lint, typecheck, test e build). Adicionar `"engines": {"node": ">=22"}`.
  6. Criar a estrutura `src/app`, `src/modules`, `src/lib` e `tests/e2e`.
  7. Escrever um teste unitário de exemplo.
- **Pronto quando:** `npm run check` passa verde e `npm run dev` abre a página.

#### M1.31 Base visual provisória

- **Fazer:**
  1. Carregar a skill `frontend-design`.
  2. Criar os grupos de rotas:
     - `(site)`: público, com cabeçalho e rodapé (rodapé com o espaço para nome e CRC);
     - `(cliente)`: área do advogado, com menu Processos, Novo pedido e Conta;
     - `(painel)`: área do André, com menu Fila, Pedidos, Clientes e Configurações.
  3. Criar os tokens em `globals.css` (variáveis do shadcn):
     - paleta sóbria, neutra, com uma cor de destaque;
     - par tipográfico profissional pelo `next/font` (sugestão: Source Sans 3 e Source Serif 4);
     - sem emojis e sem gradientes chamativos.
  4. Criar páginas provisórias: `/`, `/entrar`, `/cadastro`, `/app` e `/painel`.
  5. Escrever um teste no Playwright que abre cada página em 375 e 1440 px e roda o axe.
- **Pronto quando:** o teste passa, e o visual está registrado em capturas no PR.

#### M1.32 Rota de saúde

- **Fazer:**
  1. Criar `src/app/api/health/route.ts`. Ele responde `{status: "ok", version, sha, region}`:
     - `version` vem do `package.json`;
     - `sha` vem de `process.env.VERCEL_GIT_COMMIT_SHA ?? "local"`;
     - `region` vem de `process.env.VERCEL_REGION`.
  2. Escrever um teste.
- **Pronto quando:** o teste passa e `curl localhost:3000/api/health` responde.

#### M1.40 Supabase local

- **Fazer:**
  1. Na raiz: `supabase init`. Em `supabase/config.toml`, definir `project_id = "andre-calculos"` e `[storage] file_size_limit = "500MB"`, alinhado ao limite de 500 MB do bucket.
  2. `supabase start`.
  3. Criar `scripts/seed-dev.ts`, que roda com `npx tsx` e usa a API admin local para criar usuários de teste com os e-mails `@exemplo.com`:
     - cliente A;
     - cliente B;
     - André de teste (calculista);
     - admin de teste.
  4. Criar `supabase/seed.sql` com um processo inventado. Nenhum dado real.
  5. Documentar no README como subir: `supabase start`, `scripts/dev-env.sh`, seed.
- **Observação:** `supabase start` é local e não usa login. Não rodar `supabase link`, `db push` nem comandos de nuvem: a CLI está logada em outra conta.
- **Pronto quando:** `supabase status` mostra tudo rodando e os quatro usuários existem.

#### M1.41 Ligar o app ao Supabase com @supabase/ssr

- **Fazer:**
  1. Instalar `@supabase/supabase-js` e `@supabase/ssr`.
  2. Criar os clientes:
     - `src/lib/supabase/server.ts`: `createServerClient` com cookies, sessão do usuário, RLS aplicada;
     - `src/lib/supabase/admin.ts`: `import 'server-only'`, chave secreta, só para cron, webhooks e operações de sistema, sempre com verificação explícita de permissão;
     - `src/lib/supabase/browser.ts`: cliente público disponível apenas para Auth/Storage; login realizado por Server Action e cookies HttpOnly, upload por assinatura restrita ao caminho, sem expor JWT da sessão.
  3. Criar `src/proxy.ts` (Next 16), que renova a sessão.
  4. Criar uma função `getSessionProfile()` que devolve o usuário e o papel.
- **Pronto quando:** um teste mostra uma página server lendo o usuário logado, e nenhum componente cliente faz consulta de dados ao banco.

#### M1.42 Migrations iniciais com RLS

- **Fazer:**
  1. Criar com `supabase migration new init` o arquivo `supabase/migrations/<timestamp>_init.sql`, com as tabelas abaixo. Regras gerais:
     - dinheiro em `bigint` com sufixo `_cents`; datas em `date`; momentos em `timestamptz`;
     - `id uuid default gen_random_uuid()`;
     - `created_at` e `updated_at` em todas.

     As tabelas:
     - `profiles`: `id` = `auth.users.id`, `role` (`client`, `calculator`, `admin`), `full_name`, `phone`, `oab_number`, `oab_state`;
     - `clients`: `owner_id`, `kind` (`person`, `company`), `document`, `legal_name`, `has_contract`;
     - `processes`: `client_id`, `cnj_number`, `court`, `chamber`, `side` (`claimant`, `defendant`), `claimants_count`;
     - `orders`: `process_id`, `client_id`, `calc_type`, `area`, `status`, `urgent`, `complexity`, `total_cents`, `deposit_cents`, `delivery_date`, `internal_due_date`, `price_table_id`, `code` (`P-0001`);
     - `checklists`: `order_id`, `schema_version`, `answers` em jsonb;
     - `price_tables`: `version`, `active`, `is_example`;
     - `price_items`: `price_table_id`, `code`, `label`, `kind` (`base`, `addon`, `percent`), `amount_cents`, `percent_bp`, `rule` em jsonb;
     - `quotes`: `order_id`, `number`, `items` em jsonb, `total_cents`, `valid_until`, `accepted_at`, `accepted_ip`, `accepted_user_agent`, `accepted_by`;
     - `payments`: `order_id`, `kind` (`deposit`, `balance`, `triage`), `method` (`pix_manual`, `asaas`), `amount_cents`, `status` (`pending`, `confirmed`, `refunded`), `confirmed_by`, `confirmed_at`, `provider_ref`;
     - `files`: `process_id`, `order_id`, `folder` (`case`, `client`, `deliverables`, `triage`), `bucket`, `path`, `name`, `mime`, `size_bytes`, `sha256`, `version`, `pages`, `uploaded_by`;
     - `page_index`: `process_id`, `file_id`, `piece`, `pages` em texto, `note`;
     - `decisions`: `process_id`, `order_id`, `parameter`, `value`, `source` (`judgment`, `appeal`, `decision`, `lawyer`, `calculator`), `page`, `rationale`, `recorded_by`, `client_confirmed_at`;
     - `messages`: `process_id`, `author_id`, `body`, `attachment_ids` em `uuid[]`;
     - `timeline_events`: `process_id`, `order_id`, `kind`, `data` em jsonb, `actor_id`;
     - `deadlines`: `order_id`, `notice_date`, `act_type`, `days`, `due_date`, `slack_days`, `internal_due_date`, `adjustments` em jsonb;
     - `notifications` (fila de envios): `channel` (`email`, `whatsapp`), `recipient`, `template`, `data` em jsonb, `status` (`pending`, `sent`, `failed`), `attempts`, `last_error`, `send_after`, `sent_at`, `dedup_key` único;
     - `notification_preferences`: `profile_id`, `event`, `channel`, `enabled`;
     - `settings`: uma linha, com dados do responsável técnico, chave Pix, contatos do André, folga, urgência, validade da proposta e textos padrão;
     - `reviews`;
     - `audit_log`: `actor_id`, `action`, `target_type`, `target_id`, `ip`;
     - `consents`: `profile_id`, `document` (`terms`, `privacy`), `version`, `accepted_at`, `ip`.
  2. Criar as funções `is_calculator()` e `is_admin()` (`security definer`, leem `profiles.role`).
  3. Criar a RLS em todas as tabelas:
     - o cliente vê só o que pertence aos clientes dele;
     - o calculista vê tudo;
     - o admin vê configurações, mas não arquivos nem mensagens (D13).
  4. Criar a trigger `handle_new_user`: cria o `profile` (papel `client`), o `client` e os `consents` a partir do `raw_user_meta_data`.
  5. Aplicar localmente: `supabase db reset`.
  6. Escrever testes de RLS (Vitest contra o Supabase local) com os usuários A e B.
  7. Aplicar na nuvem pelo MCP `andre-calculos-supabase`, com `apply_migration` e o mesmo SQL. Depois, `get_advisors` de segurança e de desempenho.
- **Pronto quando:** os testes de RLS passam (o cliente B não lê nada do A), e os advisors não têm achado crítico.

#### M1.43 Login e papéis

- **Fazer:**
  1. Criar as páginas:
     - `/entrar`: e-mail e senha, e link de acesso;
     - `/recuperar-senha`;
     - o callback de confirmação.
  2. Criar a função `requireRole()` nos layouts de `(cliente)` e `(painel)`:
     - o cliente não entra no painel;
     - o calculista e o admin entram no painel.
  3. Em desenvolvimento, os e-mails do login caem no Mailpit local (porta 54324).
  4. O papel de calculista e de admin é dado por SQL pelo Fábio (o seed local já cria).
  5. Escrever um teste e2e: o cliente tenta abrir `/painel` e recebe acesso negado.
- **Pronto quando:** os testes de login, logout e acesso negado passam.

#### M1.44 Buckets privados e upload retomável

- **Fazer:**
  1. Por migration, criar o bucket `processos`:
     - privado;
     - limite de 500 MB por arquivo;
     - tipos permitidos: PDF, imagens, XLSX, CSV, DOCX e `application/octet-stream` para o .pjc.
  2. Usar o caminho `{client_id}/{process_id}/{folder}/{uuid}-{nome}`.
  3. Criar as políticas em `storage.objects`:
     - cliente/calculista só inserem em caminhos de uploads pendentes autorizados;
     - leitura passa pelo servidor, com RLS e auditoria antes da URL assinada; não conceder SELECT direto em Storage para permitir bypass da auditoria.
  4. Fazer o upload pelo navegador com Uppy e `@uppy/tus`:
     - endpoint `https://qtofwbxujshroaafxowr.storage.supabase.co/storage/v1/upload/resumable/sign` (local: `http://127.0.0.1:54321/storage/v1/upload/resumable/sign`), conforme exemplo oficial de upload assinado do Supabase;
     - cabeçalhos `x-signature` (autorização de um caminho por 2 h) e `apikey` pública; JWT de sessão permanece no servidor;
     - pedaços de 6 MiB e uploadDataDuringCreation; conferir tamanho e SHA-256 no servidor antes de liberar o arquivo.
  5. No servidor, gerar o download como URL assinada de 120 s e registrar no `audit_log`.
  6. No painel do Supabase (plano Pro), ajustar o limite global de arquivo.
- **Pronto quando:** um arquivo fictício de 300 MB sobe localmente, o upload retoma depois de cortar a rede, e o cliente B não consegue baixar arquivo do A.

#### M1.50 Projeto na Vercel e produção

- **Fazer:**
  1. **O Fábio** instala o app da Vercel (conta do cliente) na organização Harmony-Digital do GitHub, com acesso só a `andre-calculos`.

     Se preferir não instalar, a alternativa é publicar pelo GitHub Actions com um `VERCEL_TOKEN` do cofre de produção.
  2. **O agente**, pelo MCP `andre-calculos-vercel` ou pelo painel com o Fábio:
     - cria o projeto ligado ao repositório, com Root Directory `app`, framework Next.js e Node 22;
     - cria o `app/vercel.json` com `"regions": ["gru1"]`;
     - define a branch de produção `main`;
     - liga o preview a cada PR.
  3. Publicar.
  4. Depois, registrar `VERCEL_PROJETO` em `scripts/contas-esperadas.env` e, se quiser, restringir o MCP ao projeto pela URL `https://mcp.vercel.com/<time>/<projeto>`.
- **Pronto quando:** a URL `.vercel.app` responde `/api/health` com o SHA, na região `gru1`.

#### M1.51 Fila de envios e Vercel Cron

- **Divisão antes da implementação:** M1.51a/b verificam a preparação local dentro do M1/M2 já autorizado; M1.51c preserva a ativação externa. A fila canônica é `public.notifications`, criada em 0001 e usada pelos produtores transacionais. Não criar uma segunda fila `outbox`.
- **Fazer:**
  1. Criar `src/modules/notifications` com:
     - `enqueue({channel, recipient, template, data, dedupKey})`;
     - `processPending()`: tenta até 5 vezes, com espera crescente.
  2. Criar os adaptadores:
     - `console` (desenvolvimento);
     - `email` e `whatsapp`, ainda vazios, que serão preenchidos em M2.28 e M2.29.
  3. Criar a rota `src/app/api/cron/notifications/route.ts`, que exige `Authorization: Bearer ${CRON_SECRET}`. A Vercel envia esse cabeçalho sozinha quando a variável existe.
  4. No `vercel.json`, criar o cron `{"path": "/api/cron/notifications", "schedule": "*/5 * * * *"}`.
  5. Escrever testes de fila, dedup e nova tentativa.
- **Pronto quando:** os testes passam e o cron aparece no painel da Vercel.

#### M1.51a Reservas e resultados persistentes da fila local

- **Dependências:** partes locais verificadas de M1.42/M1.43 e modelos M2.28a. Não exige M1.50; não conclui as partes externas de M1.42 ou M1.51.
- **Fazer:** versionar uma migration sobre `public.notifications`, com reservas exclusivas e recibos privados imutáveis, RLS e RPCs disponíveis somente ao sistema. Conservar `pending` durante a reserva para preservar o cancelamento dos lembretes. Usar relógio do banco, cinco tentativas no máximo e espera crescente apenas após falha comprovadamente repetível. Repetir a mesma requisição deve recuperar a mesma reserva/resultado, sem tomar outro aviso. Resultado de envio desconhecido ou reserva expirada deve ficar bloqueado para reconciliação, sem reenvio automático. Nunca restaurar avisos cancelados, concluídos ou falhos. Não imprimir destinatário, conteúdo, segredo ou erro bruto.
- **Pronto quando:** testes no PostgreSQL local comprovam concorrência, deduplicação existente, repetição após resposta perdida, rollback, cancelamento, token antigo, espera crescente, quinta tentativa e resultado incerto; advisors locais executados e qualidade/build aprovados. Recibo fictício não comprova entrega externa; proteção do estado no banco não assegura entrega exatamente uma vez por um provedor.

#### M1.51b Executor com transporte fictício

- **Dependências:** M1.51a.
- **Fazer:** implementar `processPending()` somente no servidor e no ambiente local confirmado, com lote de 1 a 25 posições. Persistir execução imutável vinculada a `runId`, canal, limite, alvos opcionais e versão; requestIds gerados uma vez e preservados na retomada, sem substituir posições já selecionadas. Consultar recibo antes do transporte e após corrida; nunca usar conclusão com sucesso como consulta. Transporte fictício sem rede persiste resultado por tentativa e aceitação única pela chave do aviso + hash do snapshot; revalida e grava na mesma transação. Resultado perdido/indeterminado interrompe o lote para retomada pelo mesmo runId; lease expirada continua bloqueada. Adaptador ausente bloqueia antes da reserva, sem sucesso ou tentativa. Saída somente com modo simulation, contagens e indicação de parada, sem dados privados. Não adicionar endpoint ou cron ativo. Destinatário/público e preferências exigem revalidação específica antes de habilitar transporte real.
- **Pronto quando:** testes reais locais comprovam processamento, retomada após perda da resposta do transporte e da conclusão, mesmo/diferentes runIds concorrentes, limite e parâmetros imutáveis, resultados conhecidos e parada em desconhecido, cancelamento/expiração antes/depois da aceitação, ausência de rede externa/logs privados e RLS/grants. Recibos distinguem aceitação simulada de entrega real; evidência fictícia não renova lease nem restaura avisos bloqueados/cancelados.

#### M1.51c Ativação autorizada do cron

- **Dependências:** M1.51b, M1.50, contas/credenciais do cliente e autorização de infraestrutura/envio. Transporte real de e-mail/WhatsApp depende de M2.28b/M2.29 e de contrato de idempotência/reconciliação do provedor.
- **Fazer:** preparar endpoint Bearer e cron descritos em M1.51, confirmar identidade/destino, revalidar público/preferências e ativar somente o adaptador aprovado. A rotina local e os recibos fictícios não autorizam produção.
- **Pronto quando:** endpoint autenticado, cron no painel e jornada autorizada verificados, sem exposição da fila ou envio indevido; critérios externos de M1.51 concluídos.

#### M1.52 Backup do banco

- **Fazer:**
  1. Confirmar no painel do Supabase (plano Pro) que o backup diário está ativo.
  2. Escrever `docs/operacao.md`: onde ver os backups, como restaurar (destino novo isolado e método conferido; restauração física exige plano pago/backups físicos e pode iniciar extensões externas; usar método lógico quando for necessário impedir efeitos antes de restaurar), quem pode fazer.
  3. Registrar que os arquivos do Storage terão cópia própria no M3 (M3.22).
- **Pronto quando:** o documento existe e o backup aparece no painel.

#### M1.52a Preparo documental de backup e restauração

- **Dependências:** requisitos de M1.52/PRD operação e documentação oficial atual. Não depende da compra do plano, de acesso a backups reais ou de autorização para restaurar dados.
- **Fazer:** escrever `docs/operacao.md` com conferência de identidade/backup no painel, responsabilidades e autorizações, procedimento de restauração para destino novo isolado quando o recurso/plano estiver disponível, verificações posteriores de banco/RLS/Auth/aplicação, limites da cobertura do Storage e evidências mínimas sem dados/segredos. Registrar divergências entre a especificação e o recurso atual. Conferência/execução reais continuam em M1.52/M3.22; não escolher plano/custo/retenção nem ativar integrações, cron, envio ou produção.
- **Pronto quando:** documento em português conferido contra fontes oficiais e regras/arquivos do projeto, links/destinos e instruções revisados independentemente, sem segredo ou comando destrutivo executado; tarefa pai aberta, com confirmação/ensaio externo explicitamente separados.

#### M1.60 Cadastro no Hub (Fábio)

- **Fazer:**
  1. No Hub, criar o projeto.
  2. Em Editar projeto, Importar o plan.md: colar este arquivo, ver a prévia e importar.
  3. Devolver ao repositório o arquivo com os códigos HUB.
  4. Criar a chave do agente e guardar no cofre: item "Hub", campo `HUB_API_KEY`.
- **Pronto quando:** o plano existe no Hub e o arquivo com os códigos está no repositório.

#### M1.61 MCP do Hub

- **Fazer:**
  1. Seguir `docs/agentes-conexao.md` do repositório do Hub.
  2. Adicionar o servidor `hub` ao `.mcp.json`, sem segredo, com a chave vinda de `HUB_API_KEY`.
  3. Fazer a primeira chamada: `hub_whoami`.
- **Pronto quando:** `hub_whoami` mostra o projeto deste cliente.

### M2 — Portal comercial no ar

#### M2.01 Formulário de marca

- **Fazer:**
  1. O agente escreve `docs/marca/formulario.md`, com 10 a 15 perguntas: público, valores, tom, nomes de que gosta e de que não gosta, cores, concorrentes e as restrições do CFC à publicidade.
  2. O Fábio envia ao André.
  3. Com as respostas, o agente propõe 10 nomes, confere o domínio `.com.br` no Registro.br e recomenda uma busca no INPI.
  4. O Fábio e o André decidem (D3).
- **Pronto quando:** D3 está marcada com nome e domínio.

#### M2.02 Página inicial

- **Fazer:**
  1. Em `(site)/page.tsx`, criar as seções:
     - proposta de valor;
     - como funciona, em 4 passos;
     - o que está incluído: PDF do cálculo, .PJC, parecer assinado e registro das decisões;
     - prazos e urgência;
     - preço "a partir de", lido da tabela ativa;
     - garantia (texto conforme D5);
     - responsável técnico: nome, CRC e categoria, lidos de `settings`;
     - perguntas frequentes;
     - chamada para o cadastro;
     - rodapé com CRC, termos, privacidade e contato.
  2. Seguir as regras de texto da NBC PG 01: nada de "o mais barato", nada de garantia de êxito, nenhuma comparação com concorrentes, tom técnico.
  3. Criar metadados de SEO e Open Graph.
  4. Enquanto o André não mandar os dados, mostrar marcadores visíveis só fora de produção. Em produção, a seção do responsável técnico não aparece sem os dados reais.
- **Pronto quando:** o teste de tela e o axe passam, e o texto tem o ok do André.

#### M2.03 Termos de uso e política de privacidade v1

- **Fazer:**
  1. Criar `app/content/legal/termos-v1.md` e `privacidade-v1.md`, exibidos em `/termos` e `/privacidade`, com a versão numa constante.
  2. **Termos:** objeto; cadastro; orçamento e proposta; pagamento de 50% e 50%; prazos; responsabilidades do cliente (documentos e informações); garantia; propriedade das entregas; foro.
  3. **Privacidade:**
     - controlador (André ou a empresa dele);
     - fornecedores (Supabase, Vercel, Resend, Meta/WhatsApp e, a partir do M4, Anthropic);
     - bases legais: art. 7º, V e VI; art. 11, II, "d";
     - dados tratados e retenção (D8);
     - direitos do titular e contato do encarregado;
     - transferência internacional.
  4. Marcar o texto como rascunho a ser revisado por advogado.
- **Pronto quando:** as páginas estão no ar, e a versão é gravada no aceite (`consents`).

#### M2.04 Cadastro e login do cliente

- **Fazer:**
  1. Em `/cadastro`, criar o formulário com os campos do RF-10 e a validação:
     - CPF e CNPJ com dígito verificador, em `src/lib/documents.ts`, com testes;
     - OAB: número e UF;
     - celular convertido para o formato E.164.
  2. Chamar o `signUp` do Supabase com `options.data`, contendo os dados e as versões dos termos e da política. A trigger de M1.42 cria `profile`, `client` e `consents`.
  3. Exigir confirmação do e-mail.
  4. Mostrar as mensagens de erro em português, com o nome do campo.
- **Pronto quando:** o e2e faz o cadastro, a confirmação (Mailpit local), o login e chega a `/app`.

#### M2.04a Impedir cadastro direto sem aceite jurídico

- **Origem/dependências:** RF-02/RF-10, M2.03/M2.04. Correção local de segurança; não aprova textos jurídicos nem ativa cadastro comercial.
- **Fazer:**
  1. Nova migration substitui o hook Auth. Antes de inserir perfil/cliente, exigir `accepted_legal` booleano JSON verdadeiro, configuração jurídica existente, versões textuais não vazias e correspondência exata com as duas versões aprovadas. Trancar a configuração até concluir a transação.
  2. Criar perfil com papel `client`, cliente e dois consentimentos com versões da configuração e instante do banco; auditoria/aviso continuam transacionais. Ausência, falsidade, tipo inválido, versão divergente ou revogada recusam a criação, sem persistência parcial. Papel e condição de contrato nunca vêm de metadados públicos.
  3. Bootstrap de fixtures usa autorização privada de uso único por UUID exato e validade curta, registrada exclusivamente pelo PostgreSQL administrativo local. Nenhum acesso ou RPC de concessão para `anon`, `authenticated` ou `service_role`; tabela com RLS. Hook consome a autorização atomicamente e audita provisionamento administrativo, sem inventar consentimentos ou aviso de cadastro público.
  4. Helper local valida o destino, gera UUID, registra autorização, chama `auth.admin.createUser({ id, ... })`, confere a identidade retornada e limpa autorização residual no `finally`. Adaptar seed e usuários temporários. Sem exceções por e-mail, `user_metadata`, hostname ou variável de ambiente no hook de produção.
  5. Não atribuir vigência aos rascunhos nem chamar aceite de fixture de aprovação jurídica. M2.03 continua aberta para publicação/revisão e correspondência entre conteúdo exibido e versão aceita; endurecimento do Auth não encerra essa tarefa.
- **Pronto quando:** API Auth direta rejeita cadastro sem aceite/configuração/versões válidas; sucesso registra exatamente dois consentimentos sem elevar papel; UUID falso e marcadores públicos não concedem bootstrap. Uso único, expiração, disputa, rollback, seed repetível, usuários temporários e jornada completa verificados. `npm run check`, suíte real de banco e advisors locais aprovados; nenhuma mudança de Auth na nuvem nesta tarefa.

#### M2.04b Validar o transporte público do cadastro no banco

- **Origem/dependências:** RF-10, M2.04/M2.04a. O parser Next.js valida o formulário, mas não protege chamada direta ao Auth com aceite correto e dados obrigatórios ausentes.
- **Fazer:**
  1. Definir e documentar os tipos e formatos canônicos enviados pelo parser: nome e razão/nome do escritório, celular E.164, tipo pessoa/empresa e documento com dígitos válidos. OAB/UF continuam opcionais e coerentes entre si; cidade segue os limites existentes. Não conferir identidade ou inscrição real nesta tarefa.
  2. Implementar validadores SQL determinísticos privados para CPF e CNPJ numérico/alfanumérico, usando os vetores e a regra documentada em docs/validacao-cadastro.md. Verificar tipo JSON, limite e formato antes dos inserts; não truncar entrada inválida para fazê-la parecer válida.
  3. Substituir o hook por nova migration. Cadastro público sem campo obrigatório, com tipo inválido, documento/celular inválido ou par OAB/UF incoerente falha atomicamente. Bootstrap privado mantém o caminho administrativo de fixtures, sem aceitar papel/contrato dos metadados.
  4. Comparar o transporte produzido pelo parser com o banco em testes, incluindo CNPJ alfanumérico e zeros iniciais. Metadados posteriores do Auth não alteram perfil nem consentimentos; edição continua pelo caso de uso de conta.
- **Pronto quando:** negativos diretos de Auth não deixam conta/perfil/cliente/consentimento/aviso; dados válidos do formulário chegam sem perda ao banco. Seed/fixtures, suíte real de banco e cadastro/jornada em 375/1440 px continuam aprovados, npm run check e advisors locais verdes. Sem alteração Auth na nuvem ou uso de dados reais.

#### M2.04c Falha de link e retorno automático

- **Origem/dependências:** RF-10/12; M1.43 local e fluxos já implementados de M2.04/M2.06. O callback redireciona para `link=invalido`, mas a tela ignora o motivo; o ensaio Mailpit usa navegação manual depois do e-mail.
- **Fazer:**
  1. Mostrar mensagem portuguesa e orientação para solicitar novo link quando o callback recusar a tentativa. Nunca exibir código/token/URL, causa interna ou indicar existência de conta; parâmetros desconhecidos não viram conteúdo arbitrário.
  2. Conferir callback sem código/código fictício inválido, reaproveitamento e navegador diferente, sem sessão indevida ou retorno externo. Preservar Cache-Control e filtro de destino; usar a mesma origem pública configurada do envio de links, ignorando origem interna do Next e cabeçalhos forjados. Aceitar HTTPS e HTTP local explícito, sem credenciais ou outros esquemas. O teste real encontrou troca de 127.0.0.1 por localhost quando o callback usava request.url.
  3. Fortalecer a jornada local com Mailpit: recuperação chega automaticamente a /nova-senha e link de acesso chega a /app, sem page.goto que mascare o retorno. Usar só usuários/caixas fictícias e limpar fixtures; não registrar senhas, tokens ou cookies.
  4. Conferir erro/orientação/foco/axe em 375/1440 px; não alterar Auth/SMTP, allowlist ou configuração em produção.
- **Pronto quando:** erro compreensível e destinos reais locais são verificados sem navegação corretiva; regressões de login/senha passam e npm run check/build da fonte aprovado. O ensaio dos templates novos e SMTP real permanece em M2.28c.

#### M2.05 Aviso ao André no cadastro

- **Fazer:**
  1. No caso de uso do cadastro, chamar `enqueue` com o modelo `new_signup` para o André, pelos canais das preferências dele.
  2. O conteúdo é nome, OAB e cidade. Nada de documento.
- **Pronto quando:** o teste mostra a notificação na fila após o cadastro.

#### M2.06 Página da conta

- **Fazer:** em `/conta`:
  1. editar o perfil;
  2. trocar a senha (`updateUser`);
  3. pedir exclusão de conta: registra em `audit_log`, avisa o André e mostra o aviso de que a exclusão respeita a retenção legal.
- **Pronto quando:** existem testes para os três fluxos.

#### M2.07 Tabela de preços (André; agente prepara)

- **Fazer:**
  1. O agente escreve `docs/precos/questionario.md` com o que o André precisa definir:
     - preço base por tipo de cálculo;
     - adicionais: por verba, por período, por cartão de ponto a digitar, por reclamante extra;
     - percentual de urgência;
     - prazo padrão por complexidade;
     - folga;
     - validade da proposta.
  2. O agente cria o seed com os valores de referência do relatório de concorrentes, marcado `is_example = true`: inicial R$ 150, liquidação R$ 250, impugnação R$ 300, atualização R$ 100, cartão de ponto +R$ 70, urgência +30%.
  3. Quando o André responder, carregar os valores pelo painel (M2.33).
- **Pronto quando:** a tabela real do André está ativa.

#### M2.08 Checklist trabalhista em etapas

- **Fazer:**
  1. Criar o schema `checklistLaborV1` (Zod) em `src/modules/checklist/v1.ts`, em 9 etapas:
     1. Processo: número CNJ, TRT, vara, lado e número de reclamantes.
     2. Tipo de cálculo.
     3. Decisões: sentença, acórdão, decisão interlocutória, índice fixado, estratégia do advogado.
     4. Datas.
     5. Verbas.
     6. Jornada: cartões digitais, manuscritos (com estimativa de meses) ou jornada fixada pelo juiz.
     7. Documentos e descontos.
     8. Prazo: data da ciência, tipo de ato, urgência.
     9. Instruções.
  2. Validar o número CNJ com o dígito verificador (módulo 97, Resolução CNJ 65/2008) em `src/lib/cnj.ts`, com testes. Na Justiça do Trabalho, o segmento J é 5.
  3. Fazer a interface com React Hook Form e `zodResolver`, por etapa, e um resumo no fim.
  4. Antes do banco, a interface fica só no estado da tela. Depois de M1.42, o rascunho é salvo em `orders` (`draft`) e `checklists`.
- **Pronto quando:** existem testes do schema e e2e do preenchimento completo, e o André validou os campos.

#### M2.09 Motor de preço

- **Fazer:**
  1. Criar `src/modules/quotes/pricing.ts` com `calculateQuote(answers, priceTable)`. Ele devolve:
     - os itens (código, descrição, valor em centavos);
     - subtotal, urgência e total;
     - sinal (metade do total arredondada para cima em centavos) e saldo;
     - complexidade (de M2.11);
     - prazo em dias úteis.
  2. Usar só inteiros: centavos e pontos-base (1% = 100 pb).
  3. Escrever testes em tabela: cada adicional, urgência, arredondamento e tabela vazia.
- **Pronto quando:** a cobertura do arquivo fica acima de 95%.

#### M2.10 Calculadora de prazo processual

- **Fazer:**
  1. Criar em `src/modules/deadlines/` as funções `isBusinessDay`, `addBusinessDays` e `computeDeadline({noticeDate, actType, days?, suspensions[]})`.
  2. A contagem segue o art. 775 da CLT: exclui o dia do começo, inclui o do vencimento e conta só dias úteis.
  3. Os prazos por tipo de ato: impugnação 8, embargos 5, agravo de petição 8, outro com os dias informados.
  4. O calendário é próprio, com a Páscoa calculada:
     - feriados nacionais: 1/1, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11 e 25/12;
     - feriados da Justiça Federal e do Trabalho (Lei 5.010/1966, art. 62): segunda e terça de Carnaval, quarta a sexta da Semana Santa, 11/8, 1/11 e 8/12;
     - suspensão de prazos de 20/12 a 20/01 (CLT, art. 775-A);
     - feriados locais e portarias do TRT entram em `suspensions`, com motivo.
  5. Calcular o prazo interno: vencimento menos a folga, em dias úteis (D10).
  6. Escrever testes com casos reais: véspera de Carnaval, Semana Santa, 20/11, dezembro e janeiro.
  7. Conferir a lista de feriados com o André antes de publicar.
- **Pronto quando:** os testes passam e o André confere três casos.

#### M2.11 Classificador de complexidade

- **Fazer:** criar `classifyComplexity(answers)`, que devolve `{level, reasons[]}`:
  - **alta:** cartões manuscritos ou em imagem, mais de um reclamante, 6 ou mais verbas, ou processo com mais de 1.000 páginas;
  - **simples:** só verbas rescisórias, sem jornada;
  - **média:** o resto.
- **Pronto quando:** existem testes por regra. Os limites ficam em `settings` para o André ajustar.

#### M2.12 Tela de orçamento e PDF da proposta

- **Fazer:**
  1. Ao fim do checklist, criar a proposta `quotes`, com número sequencial `ORC-AAAA-NNNN` e validade padrão de 7 dias (em `settings`).
  2. Mostrar os itens, o total, o sinal, o saldo, o prazo de entrega, as condições, e os botões Aceitar e Recusar.
  3. Gerar o PDF em `GET /api/quotes/[id]/pdf`, autenticado, com `@react-pdf/renderer`. Ele traz nome, CRC, contato, itens, total, validade, condições e data.
- **Pronto quando:** o e2e gera a proposta e baixa o PDF, e o PDF mostra o CRC.

#### M2.12a Recusa de proposta pelo cliente

- **Origem/dependências:** botão previsto em M2.12; RF-23/RF-30, RN-01/RN-04/RN-09 e estrutura transacional de M2.15/M2.19a. Recusa pré-contratação; D5/reembolso permanecem abertos.
- **Fazer:**
  1. Criar evento puro `reject_quote`, exclusivo do cliente proprietário, de `quoted` para `cancelled`. Mostrar “Proposta recusada” no recibo e na timeline; preservar proposta/PDF, contextos, arquivos, valores, condição de contrato e histórico.
  2. Conferir `canReject` no servidor, separadamente de `canAccept`: proprietário/papel atuais, proposta não simulada com contexto comercial canônico/hash íntegro e sem ambiguidade entre propostas do pedido. Exigir nenhum aceite privado nem qualquer campo `accepted_*` em qualquer proposta, nenhum recibo de recusa e nenhum pagamento vinculado, inclusive triagem e qualquer status. Proposta vencida ou versões jurídicas atuais alteradas podem ser recusadas, pois não há contratação/cobrança nessa ação.
  3. Parser puro/testado e confirmação explícita desmarcada inicialmente. Receber proposta/hash, revisão esperada do pedido, UUID da tentativa, confirmação e motivo opcional aparado/limitado. Ator e origem HTTP vêm da sessão/headers; payload não escolhe identidade. Não usar cancelamento genérico de etapas posteriores.
  4. Nova migration com recibo privado imutável por proposta e mapa de tentativas, RLS e nenhum acesso direto pelos papéis da aplicação. Guardar ator/instante/origem, contexto, revisão e motivo. Serializar na ordem usada pelo aceite: perfil SHARE, cliente UPDATE, pedido UPDATE e proposta UPDATE; reconferir propriedade/papel, estado, revisão, contexto e histórico financeiro depois dos locks. Escritas de pagamentos continuam serializadas pelo pedido.
  5. Gravar recibo, `cancelled`, incremento de `status_revision` pelo trigger, evento compartilhado e auditoria na mesma transação. Reautorizar e recuperar replay antes de exigir estado/revisão atuais; UUID alterado conflita. Tentativas equivalentes recuperam um único recibo sem duplicar efeito. Um replay antigo não altera avanço posterior.
  6. Aceitar e recusar disputam os mesmos locks: somente uma decisão vence. RPC de aceite deve recusar novo aceite quando existir recibo de recusa, inclusive se um administrador restaurar `quoted` no ensaio. Getter mostra a recusa; painel apenas consulta. Não enfileirar aviso novo, cobrar, estornar, apagar registros ou reabrir pedido nesta tarefa.
  7. Interface preserva UUID, confirmação e motivo após perda de resposta; reenvio conserva a intenção original. Conflito definitivo pede recarga completa. Atualizar proposta/pasta/painel após sucesso, manter PDF/arquivos acessíveis e simulações bloqueadas. Positivos locais usam contexto sintético exclusivo, sem ativar contratação real.
- **Pronto quando:** testes puros e reais de banco verificam proprietário/papéis, contexto/simulação, confirmação/revisão, aceite legado/privado e cada tipo/status de pagamento; vencimento/versão atual, reenvio/UUID divergente, recusas concorrentes, aceitar × recusar nas duas ordens, restaurar `quoted`, rollback de evento/auditoria e preservação de proposta/arquivos/contrato. Navegador 375/1440 px com axe verifica confirmação, resposta perdida, conflito, consulta pelo André e PDF preservado. npm run check, suíte real e advisors locais aprovados, evidência no plano. Nenhuma publicação, cobrança, configuração Auth ou migration de nuvem nesta tarefa.

#### M2.13 Caminho "Só o PDF"

- **Fazer:**
  1. No "Novo pedido", oferecer a escolha "Só o PDF". O cliente envia o PDF (M2.18) e paga a triagem (sinal manual, tipo `triage`).
  2. O pedido passa por `awaiting_triage` e `in_triage`.
  3. O André preenche o checklist e o índice de páginas no painel, e a proposta é gerada.
  4. A taxa é abatida do cálculo se D5 assim definir (configuração em `settings`).
- **Pronto quando:** existe um e2e do caminho inteiro.

#### M2.14 Aviso de orçamento ao André

- **Fazer:** enfileirar `quote_created` para o André a cada proposta.
- **Pronto quando:** um teste confirma.

#### M2.15 Aceite eletrônico

- **Fazer:**
  1. Arquivar a proposta completa e os textos exatos dos termos/privacidade, com versões e hashes, em contexto privado imutável. O produtor comercial de M2.12 deverá criá-lo atomicamente com proposta e reserva de agenda; simulações e legados sem contexto continuam bloqueados.
  2. Criar a server action que reautoriza o proprietário, exige confirmação explícita e grava `accepted_at`, o IP (primeiro endereço completo válido de `x-forwarded-for`), o user agent limitado, o usuário e o número/conteúdo da proposta. Ator e metadados vêm da sessão/headers, sem valores fornecidos pelo formulário.
  3. Fazer a transição: `awaiting_payment`, ou `queued` com contrato e documento mínimo confirmado; com contrato sem documento, `awaiting_documents`. RF-34 exige aceite, sinal ou contrato e documento. O primeiro upload após esse aceite libera a fila atomicamente, revalidando vínculo, contrato atual e recibo.
  4. Registrar na linha do tempo/auditoria e enfileirar avisos ao cliente e André na mesma transação. Até M2.16, orientar a combinar pagamento pela conversa do processo; não prometer instruções Pix ainda inexistentes. Com contrato, esclarecer sinal dispensado e valor total para pagamento no final.
  5. Repetir uma tentativa recupera o recibo original sem duplicação ou alteração de metadados. A confirmação de upload também recupera resposta perdida usando o mesmo arquivo. Usar locks na ordem cliente, pedidos e arquivo; reconferir vencimento antes do recibo após possíveis esperas.
- **Pronto quando:** testes reais de concorrência, acesso, imutabilidade, vencimento durante locks e rollback estão verdes; navegador em 375/1440 px comprova aceite/reenvio/recarga/pasta e primeiro documento liberando fila. Contratação real também exige M2.12 comercial e aprovação dos textos.

#### M2.16 Pagamento manual do sinal

- **Fazer:**
  1. Exibir no Resumo da pasta, somente para o proprietário/calculista, sinal da proposta aceita, depósitos confirmados, restante, chave Pix atual de `settings` e código do pedido. Sem Pix, orientar a pedir os dados pela conversa. Propostas simuladas ou sem contexto/aceite não recebem cobrança.
  2. No painel, "Confirmar sinal recebido" exige decisão do calculista, usa o restante derivado no banco e grava `payments.status='confirmed'`, responsável e instante. Parcelas `deposit/confirmed` contam; `balance`, `triage`, `pending` e `refunded` não contam para sinal. Não lançar novamente a metade inteira. Sinal positivo já pago pode ser conciliado sem novo crédito; sinal zero exige conferência comercial.
  3. Preservar recibos/UUIDs imutáveis, replay após perda de resposta e proteção de valor/vínculo/autoria. UUID antigo após estorno só recupera o histórico; nova intenção exige estado apto e restante revalidado. Nenhum comando de estorno ou regra de reabertura é criado antes de D5.
  4. Exigir aceite e documento mínimo confirmado para a fila: sinal sem documento fica `awaiting_documents`; primeiro upload posterior valida novamente o aceite e sinal líquido ou contrato atual, sem alterar recibo histórico. Contrato dispensa sinal; não presumir contrato vigente a partir de condição antiga no aceite.
  5. Gravar recibo, pagamento, estado, linha do tempo, auditoria e eventual aviso na mesma transação. Enfileirar o alerta de fila só na entrada efetiva, com código, data de entrega, prazo interno e link do painel, respeitando preferências. Falha no aviso reverte tudo.
- **Pronto quando:** testes reais de permissões/concorrência/rollback e navegador em 375/1440 px conferem pagamento antes/depois do documento, sinal parcial/ímpar, replay/estorno, Pix ausente e contrato; aviso entra na fila uma vez. Ativação comercial exige insumos reais, produtor de M2.12 e textos legais aprovados.

#### M2.17 Cliente com contrato

- **Fazer:** criar no painel a opção `has_contract` no cliente, com motivo e auditoria. O efeito segue RN-04 e RF-34: dispensa sinal, preserva o aceite e exige documento mínimo confirmado para entrar na fila. Considerar também contrato cadastrado depois do aceite comum: o recibo original não muda; a transição deve validar o contrato atual e continuar funcionando se o documento vier depois. A guarda de upload de M2.15 atende contrato já existente no aceite e deverá ser integrada a esse novo caminho.
- **Pronto quando:** testes cobrem contrato anterior e posterior ao aceite, documento anterior e posterior ao contrato, ausência de aceite, replay e concorrência; recibos históricos permanecem imutáveis e não há fila sem as três condições de RF-34.

#### M2.18 Upload retomável de documentos

- **Fazer:**
  1. Criar o componente `DocumentUpload`, com Uppy Dashboard e Tus (configuração de M1.44).
  2. Calcular o SHA-256 no navegador, em partes, com `hash-wasm`.
  3. Ao terminar, uma server action confere o objeto pelo cliente admin e cria a linha em `files`, mais o evento na linha do tempo.
  4. Mostrar mensagens claras para tipo não permitido e limite de tamanho.
- **Pronto quando:** existe um e2e com arquivo grande fictício e o hash fica gravado.

#### M2.19 Máquina de estados do pedido

- **Fazer:**
  1. Criar `src/modules/orders/state-machine.ts`, com os estados (rótulos em português na tela): `draft`, `awaiting_triage`, `in_triage`, `quoted`, `awaiting_payment`, `awaiting_documents`, `queued`, `in_analysis`, `awaiting_client`, `in_calculation`, `in_review`, `delivered`, `completed`, `in_adjustment`, `cancelled`, `refunded`.
  2. Definir os eventos permitidos por papel.
  3. Criar a função `transition(order, event, actor)`, que devolve o novo estado ou um erro em português.
  4. Escrever testes para cada transição válida e para as proibidas mais importantes.
- **Pronto quando:** os testes passam. Toda mudança de status no app passa por essa função.

#### M2.19a Operação das etapas do pedido

- **Origem/dependências:** RN-09, M2.19, M2.20/21; fila já confirma as condições de RN-04. Não depende de provedores externos nem altera política comercial.
- **Fazer:**
  1. Calculista autorizado inicia análise, inicia cálculo, envia à revisão e devolve ao cálculo na aba Resumo. Cliente acompanha o estado e os eventos, sem comandar as etapas.
  2. Permitir aguardar informações e retomar exatamente a etapa interrompida; motivo obrigatório fica na linha do tempo compartilhada. D11 continua aberta: nenhum prazo é pausado ou recalculado.
  3. Parser puro e máquina de estados validam o comando; RPC exclusiva do calculista infere autoria, tranca perfil/cliente/pedido, confere estado/revisão e grava recibo privado imutável, estado, evento e auditoria atomicamente. Reenvio recupera o resultado histórico, sem desfazer ações posteriores.
  4. Revisão não significa entrega aprovada: os arquivos obrigatórios e a declaração do André continuam exigidos por M2.26. Não criar cancelamento, reembolso ou ajuste de garantia nesta tarefa.
  5. Explicitar o ID do usuário proprietário na máquina de estados; o ID da linha clients não é identidade de sessão.
- **Pronto quando:** testes de banco cobrem permissões, isolamento, concorrência, revisão antiga após ciclo de retorno, replay e rollback; navegador em 375/1440 px percorre fila → análise → cálculo → revisão → entrega sem prepareTechnicalReview. Pausa/retorno e histórico são conferidos, npm run check aprovado e advisors locais sem achados críticos.

#### M2.20 Pasta do processo

- **Fazer:**
  1. Criar `(cliente)/processos/[id]` e `(painel)/processos/[id]`, com componentes em comum.
  2. Criar as abas: Resumo, Documentos (pastas fixas e visualizador `react-pdf` carregado sob demanda), Mensagens, Decisões, Índice e Linha do tempo.
     - `react-pdf` 11.0.0 / PDF.js 6.3.289: worker, fontes, CMaps e WASM locais da mesma versão; `ssr: false` no wrapper cliente e `suspense={false}` para senha/cancelamento. Canvas/texto sem formulários ou links de anotação executáveis.
     - Visualização por `GET/HEAD /api/files/[id]/content`, com permissão e auditoria em cada requisição, transmissão por stream e suporte a Range. URL assinada de 120 s fica no servidor; download mantém seu link curto. Validação de 500 MB na Vercel continua pendente da nuvem.
  3. Se o usuário não tiver acesso, responder 404.
- **Pronto quando:** existe um e2e de navegação, e o cliente B recebe 404 no processo do A.

#### M2.21 Linha do tempo

- **Fazer:**
  1. Usar o helper SQL interno `private.record_event(...)` dentro da transação da RPC de cada caso de uso. Sem EXECUTE para os papéis da aplicação; não gravar o evento por uma segunda chamada do servidor.
  2. Mostrar a lista com ícones `lucide-react`, data e quem fez, com filtro por tipo.
  3. Aplicar filtro antes do limite e paginar com data original/UUID. Ao mudar o tipo, voltar às atividades recentes.
  4. Só o calculista registra notas; elas também aparecem ao cliente. RPC infere o autor, revalida acesso e registra nota/auditoria na mesma transação, com chave idempotente. Conteúdo de eventos é imutável.
- **Pronto quando:** os eventos de cadastro, proposta, aceite, pagamento, upload, mensagem, decisão e entrega aparecem.

#### M2.22 Mensagens

- **Fazer:**
  1. Criar o formulário com anexos, que vão para a pasta do cliente.
  2. Avisar a outra parte por e-mail (`new_message`) e o André também por WhatsApp.
  3. Atualizar com `revalidatePath`; não precisa de tempo real.
- **Pronto quando:** o e2e cobre ida e volta.

#### M2.23 Registro de decisões técnicas

- **Fazer:**
  1. Criar o formulário com:
     - parâmetro (lista: índice de correção, juros, marco inicial, período, verba, dedução, outro);
     - valor;
     - origem;
     - página;
     - justificativa.
  2. Seguir a RN-08: decisão sem página e sem confirmação do cliente aparece como "premissa".
  3. Autoria vem da sessão. RPC exclusiva do calculista valida acesso/campos, usa chave idempotente e registra decisão/evento/auditoria na mesma transação; conteúdo gravado é imutável.
  4. Só o cliente dono do processo confirma a concordância, com aceite explícito, ator/data registrados e evento/auditoria únicos; calculista não confirma em seu lugar. Repetir o registro original conserva a confirmação.
  5. Exportar em PDF em `GET /api/processes/[id]/decisions/pdf`: sessão/RLS, snapshot completo pelo banco, dados profissionais obrigatórios, cabeçalho/CRC e paginação; resposta privada sem cache. Auditoria `decisions_pdf_access` registra tentativa autorizada, não certifica geração concluída.
  6. Usar `@react-pdf/renderer` 4.9.0 e Source Sans 3 estática 5.3.1 com WOFFs locais incluídos no build; quebra visual de identificadores longos preserva o texto armazenado. Não herdar `lineHeight` na página: ensaio isolado mostrou rodapé dinâmico vazio com esse estilo. PDF não substitui parecer assinado.
- **Pronto quando:** existem testes, e o PDF lista as decisões com origem e página.

#### M2.24 Índice de páginas

- **Fazer:** criar a tabela editável, por versão do PDF, com:
  - peça: inicial, contestação, sentença, acórdão, decisão, ficha financeira, cartão de ponto, holerite, custas, cálculo anterior ou outra;
  - páginas, como texto ("120-135, 140");
  - observação.
  - Só o calculista cria/edita/remove; cliente dono lê. Referência pertence ao ID do PDF confirmado nas pastas Processo/Documentos do cliente. Uma versão nova começa com índice separado.
  - Páginas representam posições físicas do PDF, começando em 1. Parser/RPC aceitam inteiros de 1 a 100.000 e intervalos crescentes, até 100 referências/1.000 caracteres, sem expandir intervalos; observação até 2.000 caracteres. Não alegar validação contra a quantidade de páginas sem contagem confiável.
  - RPC revalida papel/acesso, trava arquivo antes da entrada, exige revisão atual e registra recibo privado/evento/auditoria na mesma transação. Replay usa payload original do recibo, mesmo após editar/remover; conteúdo diferente com a mesma chave exige recarregar/conferir. Recibos acompanham o ciclo de vida do processo.
  - Conflito de revisão usa `PT409` (HTTP 409), não `40001`: este provocava retries do PostgREST no ensaio. Arquivo indexado preserva conteúdo/identidade/versão; novas alterações exigem PDF disponível. Lista paginada de cinquenta com timestamp original/UUID e rótulos de formulário por `useId`.
- **Pronto quando:** dá para criar, editar e apagar, com teste.

#### M2.25 Fila do André

- **Fazer:**
  1. Em `(painel)/fila`, mostrar a tabela ordenada por `internal_due_date`, com pedido, cliente, tipo, complexidade, valor, situação do pagamento e status.
  2. Destacar o que vence em até 2 dias úteis e o que está atrasado.
  3. Filtrar por status.
- **Implementado localmente (2026-10-11):**
  - Estados operacionais de `queued` a revisão/ajuste, excluindo rascunho, triagem, aguardando sinal e terminais. Só calculista entra na fila; o administrador financeiro não recebe dados de processo.
  - Ordenação por data civil ASC NULLS LAST/UUID, cinquenta por página; cursor validado, filtro antes do limite e reinício ao trocar situação. Fila viva pode mudar entre páginas; nova leitura começa pelos primeiros pedidos.
  - Hoje é capturado uma vez por renderização em America/Sao_Paulo; data interna é exibida sem conversão de fuso. Destaque até o segundo dia útil usa calendário provisório, com aviso sobre feriados/suspensões do TRT.
  - Somente `deposit`/`balance` confirmados entram na soma em centavos; triagem, pendência e estorno não contam. Contrato não significa quitação.
- **Pronto quando:** existe um teste com dados de seed em várias situações.

#### M2.26 Entrega

- **Fazer:**
  1. No painel, criar o envio para a pasta Entregas: PDF do cálculo, .pjc, parecer em PDF e, se houver, DOCX ou XLSX.
  2. Criar o checklist de pré-juntada:
     - cálculo liquidado;
     - CPF ou CNPJ cadastrado no .pjc;
     - versão do PJe-Calc;
     - mês da tabela de índices.
  3. Com tudo marcado, fazer a transição para `delivered`, avisar o cliente e registrar na linha do tempo.
- **Implementado localmente (2026-10-11):**
  - Calculista confirma arquivos distintos, upload/SHA-256, versão/mês e revisão/assinatura/nome/CRC. Conteúdo do PJC e assinatura digital continuam sendo conferência humana; RF-62 é do M3.
  - Transação preserva snapshots profissionais/arquivos, entrega, estado, evento, auditoria e aviso enfileirado; locks por pedido/arquivo e chave idempotente impedem repetição e vínculo a dois pedidos concorrentes.
  - Entrega confirmada não implica download: D6 continua aberta. Sem política, cliente não recebe bytes; regra capturada por entrega impede liberação retroativa por mudança de settings. Despacho real do aviso depende de M2.28.
- **Pronto quando:** existe um e2e da entrega.

#### M2.26a Paginação das entregas

- **Fazer:** limitar o resumo a cinquenta entregas por página com navegação às anteriores/retorno às recentes, preservando microssegundos e desempate por UUID.
- **Pronto quando:** cliente e calculista recuperam mais de cinquenta registros uma única vez; cursor inválido e página vazia são tratados, em celular/computador.

#### M2.27 Download das entregas

- **Fazer:**
  1. Criar a rota no servidor que confere a permissão, gera a URL assinada de 120 s e grava no `audit_log`.
  2. Aplicar a regra do saldo (D6): se a entrega só sai depois do saldo, mostrar as instruções de pagamento.
  3. Exigir escolha/confirmação explícitas do calculista para a regra futura e aprovação individual de entregas anteriores sem regra; manter recibos imutáveis, revisão concorrente e auditoria. Não aprovar D6 real pelos ensaios.
  4. Mostrar uma pendência por pedido na página, descontando só sinais/saldos confirmados; Pix ausente remete à conversa. Regra individual anterior ao saldo permanece válida mesmo com outra entrega do pedido condicionada ao saldo.
- **Pronto quando:** o teste mostra o download registrado e o bloqueio quando a regra pede.

#### M2.28 E-mails transacionais e SMTP do login

- **Fazer:**
  1. Criar os modelos com React Email, em português:
     - `welcome`;
     - `new_signup` (André);
     - `quote_created` (cliente e André);
     - `quote_accepted`;
     - `payment_confirmed`;
     - `order_queued` (André);
     - `new_message`;
     - `deadline_reminder`;
     - `delivery_ready`;
     - `deletion_request`.
  2. Implementar o adaptador `email` da fila com o Resend.
  3. Sem domínio verificado, o Resend só envia para o próprio dono da conta, então os testes reais usam esse endereço. Em produção, o domínio precisa estar verificado (SPF, DKIM e DMARC no DNS, pelo Fábio, D3).
  4. Configurar no Supabase Auth o SMTP do Resend (o envio padrão do Supabase tem limite baixo) e os textos de confirmação, link de acesso e senha em português.
- **Pronto quando:** e-mails reais chegam na caixa de teste, e o login usa o SMTP do Resend.

#### M2.28a Modelos locais de e-mail

- **Fazer:**
  1. Criar componentes React Email com HTML/texto para as dez famílias da tarefa principal e mapear os onze nomes já produzidos. Conferir a API vigente: documentação atual usa pacote `react-email`; não adicionar pacotes antigos descontinuados.
  2. Selecionar explicitamente somente código/número/data válidos e destino reconstruído. Ignorar nomes, OAB, cidade, textos, destinatário, payload bruto e `path` fornecido pelo evento. Corpo/assunto não contêm processo, parte, documento, valores, token ou URL assinada.
  3. Usar apenas a origem pública confirmada deste projeto e rotas autenticadas conhecidas. Mensagem sem papel confiável remete a `/entrar`; data civil é apresentada sem conversão de fuso. Aviso de entrega não promete download liberado por D6, nem prazo relativo que envelhece durante retry.
  4. Preservar nome/CRC/categoria no rodapé e identificar a prévia com marca/dados fictícios. Produzir HTML/texto sem imagens/fontes remotas, anexos, consulta de banco ou transporte.
  5. Testar injeção, dados extras, destino indevido, template desconhecido, datas inválidas e nomes reais da fila. Renderizar em 375/1440 px, conferir links/teclado/axe/largura e inspecionar capturas.
- **Pronto quando:** componentes e renderizador determinístico passam nos testes, todas as variantes são renderizadas e QA visual/axe está registrado; npm run check/build da fonte aprovado. Nada foi enviado e M2.28 integral permanece aberta.
- **Dependências:** RF-70; inventário dos enfileiramentos existentes; identidade fictícia autorizada. Não exige conta Resend, segredo, SMTP ou dispatcher.

#### M2.28b Transporte Resend

- **Fazer:** integrar modelos à fila M1.51 com adaptador somente servidor, identidade/destinatário conferidos, idempotência e conciliação de resposta perdida. Configuração/chaves ficam no cofre/ambiente autorizados; Fábio aprova conta, domínio, conteúdo e destinatário do ensaio antes de envio real.
- **Pronto quando:** aviso real autorizado chega à caixa correta, retry não duplica e falha/ambiguidade não registra recebimento inexistente.
- **Dependências:** M2.28a; M1.51; conta/credenciais Resend, domínio quando necessário e autorização do envio. O produtor local `payment_confirmed` é preparado/verificado em M2.28e. O modelo `welcome` e outras variantes para cliente ainda sem produtor precisam ser vinculados por seus casos de uso, sem criar avisos em simulação.

#### M2.28e Aviso local de sinal confirmado ao cliente

- **Dependências:** partes locais verificadas de M2.16, M2.28a e M1.51a/b; RF-31/34/70 e matriz de notificações do PRD. Não depende de conta, segredo, autorização de envio ou cron externo.
- **Fazer:**
  1. Acrescentar ao caso de uso `confirm_manual_deposit` o aviso `payment_confirmed` somente quando um pagamento de sinal positivo for criado. Inferir destinatário pelo proprietário atual do cliente vinculado ao pedido, com papel cliente e e-mail disponível; nunca aceitar destinatário no comando.
  2. Usar a fila existente `public.notifications`, canal e-mail, payload limitado a pedido/processo/código e chave estável por pagamento/cliente/canal. Nenhum valor, Pix, documento, parte, texto livre, URL assinada ou path informado pelo chamador. O renderizador existente reconstrói o destino autenticado.
  3. Gravar aviso, pagamento, recibo, intenção, estado, timeline e auditoria na mesma transação. Replay original, nova intenção concorrente e recuperação após perda de resposta não criam novo aviso. Estorno seguido de novo pagamento mantém a distinção histórica; conciliação com valor zero/paymentId nulo não anuncia novo pagamento.
  4. Preservar guardas de aceite/contexto comercial, contrato, simulação e permissões do calculista. Não criar preferências do cliente nem alterar as preferências do André, o transporte, Auth/SMTP, cron, variáveis, dados na nuvem ou publicação.
  5. Ensaiar destinatário/isolamento, sinal antes/depois do documento, concorrência/replay, edição simultânea do perfil, parcelas/estorno/conciliação zero e falha do aviso com rollback integral. Adquirir o lock do perfil proprietário antes do cliente e reconferir a propriedade sob lock; validação de contato permanece somente no crédito novo. Conferir a compatibilidade com o modelo/fila locais e a limpeza das fixtures; executar regressões de banco, check/build da fonte e advisors locais.
- **Pronto quando:** migration versionada aplicada somente localmente, testes reais de transação/acesso/reenvio e regressões aprovados, modelo reconstrói a pasta correta sem dados sensíveis, advisors e revisões independentes sem bloqueador. Sem despacho externo; M2.28b/M1.51c continuam pendentes.

#### M2.28c SMTP e autenticação

- **Fazer:** preparar textos portugueses de confirmação/link de acesso/recuperação e checklist; Fábio configura SMTP/segredos e aprova alteração Auth. Ensaiar cadastro, confirmação, acesso e recuperação nas contas corretas após autorização.
- **Pronto quando:** autenticação usa o SMTP aprovado e mensagens reais do ensaio chegam com links de retorno corretos; não marcar pela existência de configuração.
- **Dependências:** M2.28b; M1.43; conta/domínio e autorização específica para Auth; responsáveis humanos pelos segredos.

#### M2.28d Modelos locais de autenticação

- **Fazer:**
  1. Preparar HTML nativo e assuntos em português de `confirmation`, `magic_link` e `recovery`, com a identidade fictícia autorizada e CRC/categoria. Não alterar `supabase/config.toml`, Auth, SMTP, variáveis ou contas.
  2. Preservar somente `{{ .ConfirmationURL }}` como interpolador entre aspas em links. Não reconstruir URL, usar `RedirectTo` sozinho, incluir dados do usuário ou criar `/auth/confirm` inexistente. O callback atual recebe código PKCE; o destino da recuperação conserva `/nova-senha`.
  3. Orientar a abertura no mesmo navegador/dispositivo da solicitação e não prometer prazo fixo ou acesso entre dispositivos. Usar link alternativo com texto legível, sem imprimir token/URL integral.
  4. Verificar o subconjunto fixo dos interpoladores e criar prévias sintéticas com URL longa, caracteres especiais e retorno codificado. Conferir DOM, ausência de injeção/requisições, foco/axe/largura e capturas em 375/1440 px. A prévia JavaScript não comprova o renderer Go do Supabase.
  5. Entregar checklist de aplicação pelo Fábio e de ensaio real posterior: domínio/destino corretos, retorno automático, link reutilizado/expirado, navegador distinto e tracking/scanners. Não afirmar SMTP funcionando pela existência dos arquivos.
- **Pronto quando:** três HTMLs e assuntos ficam revisáveis, prévias/testes/QA passam e npm run check/build da fonte aprovado. Nenhuma mensagem enviada nem alteração Auth; M2.28c integral continua aberta.
- **Dependências:** M1.43; M2.28a; RF-10/12/70; identidade fictícia autorizada e documentação oficial. Este preparo não depende do transporte real M2.28b; ativação e teste real preservam as dependências de M2.28c.

#### M2.29 Alertas por WhatsApp ao André

- **Fazer:**
  1. Criar o adaptador `whatsapp` com a interface `send({to, template, vars})`.
  2. Implementar o provedor conforme D7:
     - **API oficial:** o Fábio cria a conta Meta Business, o número e o modelo de utilidade `alerta_pedido` em pt_BR. O envio é feito por `POST https://graph.facebook.com/<versão>/<phone_number_id>/messages`.
     - **Z-API:** a API deles.
  3. O conteúdo traz só o código do pedido e a data ("Pedido P-0001: entrega dia 22/10. Veja no painel."). Nunca número do processo, nome de parte ou documento.
- **Pronto quando:** o André recebe o alerta de teste no número dele.

#### M2.30 Lembretes de prazo

- **Fazer:**
  1. Criar a rota de cron `api/cron/deadlines`, de hora em hora.
  2. Buscar pedidos não entregues com prazo interno em 2 dias úteis, em 1 dia útil ou já atrasados.
  3. Enfileirar com `dedupKey` `deadline:{order}:{tipo}:{data}`.
  4. Enviar entre 7h e 21h, horário configurável.
- **Conferência de implementação:** os campos atuais Primeiro/Segundo horário (09h/17h) são horários pontuais e não definem a janela de envio. Implementar a janela explicitamente, sem reinterpretar esses valores; manter calendário provisório identificado e ativação externa pendente até M2.10/M1.51.
- **Política verificada localmente:** antecipados somente em dia útil e atraso em qualquer dia; a data de deduplicação é o prazo interno, com um aviso de atraso por prazo. Canais OFF consomem a ocorrência; prazo/estado alterado cancela apenas pendentes e não reabre recibos antigos. Relógio real revalidado depois dos locks; helper fictício só para o proprietário do banco local. Endpoint de nuvem fica bloqueado até a revisão do calendário; configuração horária ainda fora do vercel.json ativo. Detalhes em docs/lembretes-de-prazo.md.
- **Pronto quando:** existem testes com datas simuladas e não há aviso repetido.

#### M2.31 Preferências de notificação

- **Fazer:** em Configurações, criar a tabela de eventos por canal (e-mail, WhatsApp), ligado ou desligado, gravada em `notification_preferences`. O `enqueue` respeita a escolha.
- **Conferência de implementação:** o vínculo com o responsável pelos contatos do serviço é persistente; outro calculista não passa a controlar as preferências automaticamente. Gravação usa revisão e recibo imutável, com auditoria; reenvio antigo não reaplica o valor. A escolha vale para novas ocorrências, sem cancelar avisos pendentes nem recuperar os anteriores.
- **Pronto quando:** um teste mostra que um canal desligado não recebe.

#### M2.32 Página inicial do painel

- **Fazer:** mostrar os cartões com a contagem de cadastros (7 dias), propostas abertas, aguardando pagamento, na fila, vencendo e atrasados, com links para as listas.
- **Pronto quando:** existe um teste com seed.

#### M2.33 Configurações do painel

- **Fazer:** criar as telas abaixo, só para calculista e admin.
  1. Editor da tabela de preços: salvar cria uma versão nova e ativa; o histórico continua visível.
  2. Dados do responsável técnico (nome, CRC, categoria), usados no site e nos PDFs.
  3. Chave Pix, contatos do André, folga, urgência, validade da proposta, horários de aviso e textos padrão (condições e garantia).
- **Pronto quando:** as mudanças aparecem no site e na proposta, e a versão antiga da tabela continua ligada às propostas antigas.

#### M2.34 Teste de ponta a ponta

- **Fazer:**
  1. Escrever um teste no Playwright com dois contextos (cliente e André), contra o Supabase local: cadastro, checklist, proposta, aceite, sinal, upload, mensagem, decisão, entrega e download.
  2. Rodar em 375 e 1440 px, com axe nas páginas principais.
  3. Criar no CI um job `e2e` com `supabase/setup-cli` e `supabase start`.
- **Pronto quando:** o job e2e fica verde no CI.

#### M2.35 Revisão de segurança

- **Fazer:**
  1. Carregar a skill `security-review`.
  2. Conferir:
     - RLS em todas as tabelas (advisors);
     - políticas do Storage;
     - validade das URLs assinadas;
     - `server-only` nos módulos de servidor;
     - nenhum segredo no bundle (só `NEXT_PUBLIC_` com a chave publicável);
     - cabeçalhos de segurança no `next.config`;
     - `npm audit`;
     - limites de tentativa do login no Supabase.
  3. Corrigir o que achar e registrar.
- **Pronto quando:** não há achado crítico ou alto aberto.

#### M2.35a Dependências das ferramentas de qualidade

- **Fazer:** conferir o advisory GHSA-vfj7-8cjw-p6xm e a cadeia do lock contra a fonte anterior à instalação do React Email; verificar alcance no build/bundle e obter correção compatível com Next.js 16.4 ou registrar a reclassificação oficial. Preparar inventário sanitizado imediatamente após build do CI: SHA da fonte/checkout, hash do lock/configuração/BUILD_ID, traces de produção incluindo extensões NFT, hashes dos JS server/browser e referências identificáveis dos cinco pacotes. Sem código, ambientes, traces brutos ou paths absolutos no artefato. Build incompleto falha; extensão desconhecida, referência ausente/externa ou symlink não resolvido registra cobertura incompleta. Ocorrências de symlink trazem motivo fixo e somente path relativo permitido de artefato, ou trace/índice/referência, sem alvo, path de dependência ou erro bruto. Marcadores ausentes não comprovam ausência de código minificado; inventário do CI não comprova equivalência à publicação Vercel. Não tratar downgrade incompatível do eslint-config-next como patch nem concluir segurança por audit omitindo dev.
- **Pronto quando:** correção ou encerramento oficial do achado está documentado, lock/build/testes relevantes passam e a revisão M2.35 considera o resultado. O achado continua aberto enquanto isso não ocorrer.
- **Dependências:** inventário/lock e advisory atual; encerramento da revisão integral depende da skill security-review de M2.35. Os cinco registros high do audit completo representam um advisory propagado na cadeia, não cinco falhas independentes.

#### M2.35b Inspeção restrita de dependência externalizada

- **Dependências:** coleta de M2.35a; não exige nem conclui a revisão integral M2.35.
- **Fazer:** resolver somente o alias gerado `.next/node_modules/@react-pdf/renderer-<hash>` para a instalação exata/regular em `app/node_modules/@react-pdf/renderer`. Conferir dependência de produção nos manifestos/lock, nome/versão e ausência de link/workspace/local. Ler somente JSON de identificação e JavaScript regular limitado, sem executar o pacote; recusar links internos, ancestrais simbólicos, arquivos especiais/hardlinks/ocultos, destinos inesperados e limites excedidos. Habilitar a exceção somente no CI com opção explícita (API desativada por padrão; fixtures autorizadas habilitam). Limites compartilhados: quatro aliases, 512 entradas, 32 MiB totais, 8 MiB por arquivo e profundidade oito; orçamento confere bytes efetivamente lidos. Recusar alias como diretório comum antes de percorrer. Ordenação lexical independente de locale. Conferir identidade antes/depois da leitura e exportar só alias permitido, índices, versão, contagens e hashes, sem alvo/código/paths físicos/erros brutos. Árvore estável após npm ci/build é requisito; essas guardas não eliminam corrida adversarial de escrita concorrente. Diagnóstico recusado conserva cobertura incompleta. Versão declarada não comprova integridade dos bytes nem versão incorporada pelo Next.
- **Pronto quando:** ensaios adversariais e de determinismo aprovados, check/build remoto e relatório real sanitizado conferidos contra fonte/lock/configuração/checkout. Evidência distingue resolução/inspeção dessa dependência, ausência de marcadores e conclusão de segurança. Advisory M2.35a permanece aberto sem patch/encerramento oficial; não comprova equivalência à Vercel.

#### M2.36 Ensaio com o André

- **Fazer:**
  1. Em produção, depois do GATE M1, o André usa um processo antigo autorizado do começo ao fim.
  2. O agente anota cada problema como tarefa nova `[ ]` no marco certo. Dado real só em produção, nunca no repositório.
- **Pronto quando:** o ensaio está feito e os problemas viraram tarefas.

#### M2.37 Publicar no domínio

- **Fazer:**
  1. Configurar o domínio (D3) na Vercel. O Fábio cria os registros DNS no Registro.br.
  2. Conferir o HTTPS.
  3. Verificar o domínio no Resend.
  4. No Supabase Auth, atualizar o Site URL e as URLs de retorno.
  5. Criar `sitemap.xml` e `robots.txt`.
  6. Pedir a aprovação do Fábio antes de divulgar.
- **Pronto quando:** o domínio responde com HTTPS, os e-mails saem do domínio e o Fábio aprovou.

### M3 — Validação comercial

**Detalhamento aprovado de M3.00 para implementação local fictícia.** Este detalhamento não aprova o GATE M3 nem ativa operações comerciais. Fábio autorizou a implementação local com dados fictícios em 2026-10-11, a partir do detalhamento apresentado na fonte b9b687d. Contas, custos, textos jurídicos, decisões do André e ações externas mantêm os responsáveis e autorizações de `AGENTS.md`.

**O que os ensaios já demonstraram:** aceite, recusa e pagamento precisam disputar o mesmo pedido e conservar a revisão; perda de resposta exige intenção e recibo imutáveis; dados e termos da proposta precisam continuar disponíveis apesar de mudanças posteriores; pagamentos parciais e estornos não podem liberar valores indevidos; nova versão de documento não herda referências ou concordâncias silenciosamente. Essas conclusões vêm dos testes fictícios de M2.15/16/17/23/24/27 e M2.12a. Não há evidência de ensaio real com André ou de primeiros pedidos pagos: resultados comerciais, preço, capacidade e política de garantia continuam pendentes.

**Ordem aprovada para o preparo local:** M3.01a (desdobramento técnico M3.01d → M3.01e → M3.01f) → M3.01b → M3.01c → M3.02; M3.04 → M3.07; M3.05 → M3.06; M3.08 → M3.09; M3.10 → M3.11 → M3.12. M3.13–17 e M3.19–21 podem seguir por tarefa, respeitando os insumos próprios. Aprovar a política de M3.18 → preparar/verificar restauração em M3.22 → autorizar ativação destrutiva de M3.18. M3.23/24 são executadas por André/Fábio. M3.25 → M3.26 → M3.27/28 fecham a passagem. Produção de M3.03 depende da validação sandbox, dos requisitos comerciais e da autorização específica.

#### M3.00 Detalhamento e aprovação do marco

- **Fazer:**
  1. Conferir cada RF citado contra o código e as evidências de M2; distinguir recurso existente, extensão, insumo humano e ativação externa.
  2. Especificar Fazer, Pronto quando e Dependências para M3.01–28. Dividir M3.01 em entregas verificáveis, conservando seu escopo. Antes de implementar outra tarefa grande, subdividi-la se não couber numa sessão.
  3. Registrar as lições dos ensaios fictícios e a ausência de ensaio/pedidos reais. Incorporar feedback real somente depois de recebido, sem inventar validação comercial.
  4. Apresentar a especificação ao Fábio. Registrar o alcance e a data de sua aprovação antes de começar a implementação do M3; decisões comerciais abertas e GATEs permanecem humanos.
- **Pronto quando:** todas as tarefas estão especificadas, sobreposições foram resolvidas e Fábio aprovou o detalhamento com evidência registrada.
- **Dependências:** base e testes do M2; aprovação do Fábio. A preparação documental não exige concluir GATEs nem obter todos os dados comerciais.

#### M3.01 Pagamento Asaas em sandbox

- **Fazer:** executar M3.01a/b/c na ordem, reaproveitando aceite/sinal/fila/documentos e liberação existentes. Conta e ambiente do provedor fazem parte do vínculo de cada cobrança; dados de cartão permanecem na fatura hospedada do Asaas.
- **Pronto quando:** três subtarefas verificadas e ensaio real em sandbox comprova os meios autorizados e webhook, sem documento permanecendo aguardando envio. Mocks locais não substituem integração com o provedor.
- **Dependências:** M3.00; RF-31/34; RN-04/10; M2.12/15/16. Conta/credenciais sandbox exclusivas do cliente e insumos comerciais necessários para o ensaio. Aprovação de M3.00 não autoriza produção.
- **Fontes para conferir na implementação:** [fatura/cartão hospedado](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito) e [recebimento de webhooks](https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint).

#### M3.01a Adaptador e cenários fictícios

- **Fazer:**
  1. Criar adaptador somente servidor com identidade explícita de conta/ambiente e schemas de cliente, cobrança, consulta e eventos; evitar dados de cartão no portal.
  2. Converter decimais do provedor para centavos por parser estrito, sem arredondamento silencioso ou soma em ponto flutuante. Distinguir valor bruto pago de taxa/valor líquido recebido: taxa do provedor não diminui o crédito do advogado. Validar suporte aos documentos fiscais aceitos pelo cadastro.
  3. Definir eventos financeiros para pagamento parcial, devolução parcial/total e chargeback, conservando valor original. Eventos desconhecidos ou inconsistentes vão para reconciliação, sem conceder crédito automaticamente.
  4. Testar respostas fictícias completas/ausentes/inválidas e falhas antes/depois da criação; valores, cliente, conta e ambiente divergentes são recusados.
- **Pronto quando:** contrato do adaptador e testes determinísticos passam; centavos/identidade estão inequívocos e falha externa não cria confirmação local.
- **Dependências:** M3.00; contratos de domínio de M2.12/15/16/27; documentação oficial vigente. Não precisa de segredo para testes locais.

#### M3.01d Contratos precisos do Asaas

- **Parte de:** M3.01a, sem aumento de escopo; primeira entrega do adaptador aprovado.
- **Fazer:** preservar os lexemas numéricos do JSON antes de qualquer conversão; parser limitado e com chaves duplicadas recusadas; converter/serializar centavos por BigInt sem arredondamento ou ponto flutuante. Preparar schemas somente servidor de cliente, vínculo de cobrança/consulta e envelope de evento, descartando campos de cartão/contato não usados. Distinguir accountId de walletId, conta/ambiente do vínculo configurado e account.id da origem declarada pelo evento. Guardar originalValue/value/netValue e cada estorno/status como fatos separados; nenhuma projeção financeira ou confirmação de pagamento nesta parte.
- **Pronto quando:** testes de JSON preciso, limites, campos ausentes/inválidos, CPF/CNPJ, conta/ambiente e valor/cliente/referência divergentes passam, com erros sanitizados e check/build da fonte. Suporte real de CNPJ alfanumérico e autenticação da conta não são comprovados por schemas/fixtures; ausência de confirmação ficará explícita para a porta e ensaio seguintes.
- **Dependências:** M3.00 aprovado, contratos locais de M2.12/15/16/27 e fontes oficiais atuais. Sem segredo, API autenticada, migration, transporte externo ou publicação.

#### M3.01e Adaptador somente servidor

- **Parte de:** M3.01a; depende de M3.01d.
- **Fazer:** criar porta com escopo configurado e operações de cliente/criação/consulta/fatura; produzir JSON numérico canônico, validar identidade/obrigação e origem das URLs do provedor. Testar porta fictícia e recusar divergências antes do despacho; falha/resposta perdida depois dele é indeterminada e exige conciliação sem auto-retry de criação. O driver futuro limita bytes antes de acumular resposta e comprova a associação de conta/credencial, sem tratar eco de configuração como autenticação. Campos de cartão e URLs arbitrárias não entram. Documentos preservam letras/zeros; suporte não confirmado exige conferir o provedor antes de enviar. Ausência de driver não inventa confirmação.
- **Política da porta nesta entrega:** `mode: "fixture"` e escopo declarado explícitos, sem prova de autenticação. Busca de unicidade com `limit=2`, `offset=0`; somente envelope completo/coerente com um candidato retorna encontrado. Mais de um, página incompleta, erro ou zero após resposta perdida não autorizam criação. `404` pode indicar ID de outra conta. Criação de cobrança confere cliente e notificações desativadas antes do POST; requer vencimento/meio exatos na resposta. Uma chamada de criação por invocação não garante unicidade entre chamadas; persistência/concorrência seguem em M3.01b.
- **Pronto quando:** testes determinísticos provam chamadas únicas, payloads mínimos, identidade, criação/consulta e falha antes/depois; sem banco financeiro, segredo, envio ou driver externo. Identidade declarada da porta não substitui comprovação real da conta em M3.01c.

#### M3.01f Eventos financeiros

- **Parte de:** M3.01a; depende de M3.01d/e.
- **Fazer:** normalizar recebimento parcial/total, bruto/netValue/taxa, estornos múltiplos DONE/PENDING/CANCELLED e chargeback; conservar original e distinguir snapshot cumulativo de delta. Eventos desconhecidos, incompatíveis ou insuficientes, excedente e Pix CONFIRMED cautelar exigem reconciliação, sem crédito automático. Testar fontes completas/ausentes/inválidas, duplicação e ordem; não representar estorno parcial pelo status integral atual nem chamar confirmação manual.
- **Política local de interpretação:** preservar presença missing/null/empty/present na decodificação. Normalizar evento e consulta contra o mesmo contexto da obrigação, com whitelist local de pares conhecidos e fatos/motivos explícitos; nunca retirar prefixo do evento para fabricar status. Comparar dois eventos brutos vinculados sem gerar delta: replay/conflito, projeção cumulativa igual, ordem temporal declarada e regressão de DONE/bruto/chargeback. Timestamp sem fuso/segundos não é sequência causal; candidato posterior exige consulta autoritativa em M3.01b/c antes de qualquer efeito. Nenhum documento, contato ou URL privada integra a projeção financeira.
- **Pronto quando:** matriz determinística de observações/reconciliação passa e M3.01a integral está preparada/verificada, sem aplicar crédito, mudar histórico ou executar pagamentos reais. Persistência/ativação seguem em M3.01b/c.

#### M3.01b Cobranças persistidas e reconciliação

- **Fazer:**
  1. Persistir intenção, dívida/pedido, conta/ambiente e referência de provedor antes de chamar a API; proteger criação concorrente com revisão/recibo e vínculo único pertinente.
  2. Vincular cada obrigação à finalidade e fase: sinal = sinal capturado na contratação menos crédito elegível do sinal, dispensado pela condição vigente de cliente com contrato; saldo na entrega = total contratado menos créditos elegíveis confirmados. Crédito líquido significa descontar estornos/chargebacks, nunca taxas do provedor; triagem só abate mediante regra aprovada de D5. Não cobrar o total no aceite nem emitir para simulação, recusa, dívida quitada ou pedido sem contrato válido.
  3. Executar criação fora da transação longa de banco, com processamento retomável. Depois de resposta perdida, reconciliar o que o provedor realmente criou antes de nova emissão; na impossibilidade de resolver, exigir conferência e não emitir às cegas.
  4. Reconciliar cobranças/intenções anteriores ativas ou incertas antes de outra emissão para a mesma obrigação ou fase posterior; não contar pendente como crédito nem manter faturas pagáveis sobrepostas. Mudança da condição de contrato não cancela automaticamente cobrança externa.
  5. Arquivar eventos financeiros imutáveis e atualizar projeções de crédito usadas por fila, saldo e download. Preservar pagamentos manuais/históricos; crédito excedente vai para conciliação, sem apagar recebimento ou devolver automaticamente.
  6. Mostrar fatura autenticada ao proprietário e situação de reconciliação; nenhum payload, contato, token ou URL privada vai para log.
- **Pronto quando:** criação concorrente/resposta perdida não duplica dívida, parcial/estorno/chargeback reconciliam sem apagar original e acesso cruzado é negado; rollback e replay de fila/auditoria/avisos conferidos.
- **Dependências:** M3.01a; M2.15/16/17/27; fila de processamento de emissão preparada nesta subtarefa. Testes locais antecedem credenciais sandbox.

#### M3.01g Obrigações e vínculos

- **Parte de:** M3.01b; primeira entrega após M3.01a. Ordem técnica g → h → i → j → k, sem fechar o parent isoladamente.
- **Fazer:** persistir metadados imutáveis de conta/ambiente/cliente do provedor e contexto da obrigação, vinculados a pedido/processo/cliente/aceite/hash/fase. Esta entrega usa apenas fixture/sandbox, sem segredo/autenticação/driver. Configuração privada seleciona o scope vigente; o formulário não troca conta. Derivar valores do contrato capturado e créditos legados: sinal menos crédito de sinal, dispensado pelo contrato vigente; saldo após entrega é total menos créditos de sinal/saldo. Triagem continua separada até D5. Pagamento Asaas antigo sem vínculo/projeção exige conciliação. Recusar vínculo cruzado, simulação, recusa, contrato inválido, fase indevida, dívida zero e excesso/valor inseguro. Capturar vencimento/meio fictícios não autoriza emissão. Registrar autor/contexto/recibo, sem documento/URL/segredo em logs; h/i revalidam dívida antes da intenção/POST.
- **Pronto quando:** migration local/RLS/advisors e testes reais provam acesso proprietário/calculista, vínculo conta/cliente, valores por fase/contrato vigente/crédito legado e imutabilidade/replay. Casos de uso servidor têm authorize/auditoria e check/build da fonte. Não escreve pagamento/crédito nem altera fila/download; unificação da projeção permanece j.

#### M3.01h Intenções, reservas e recibos

- **Parte de:** M3.01b; depende de g. Desdobramento técnico l → m, conservando h aberta até ambas verificadas.
- **Fazer:** intenção/referência/payload mínimo persistidos antes de POST, com revisão/tentativas/recibo imutáveis; revalidar contexto/contrato/saldo/binding. Serializar perfil → cliente → pedido → pagamentos → contexto/intenção. Bloquear emissão/fase posterior enquanto houver cobrança ativa/incerta; coordenar mudança contratual e confirmação manual sem presumir cancelamento.
- **Pronto quando:** duas sessões, replay/resposta perdida, UUID com outros dados e confirmação manual concorrente não duplicam intenção/dívida; rollback/auditoria/reserva entre fases testados, sem POST externo.

#### M3.01l Reserva, intenção e replay

- **Parte de:** M3.01h; depende de g. Preparo local, sem despacho/crédito.
- **Fazer:** derivar payload/contexto de g e revalidar dívida, contrato, proprietário e binding sob locks comuns. Persistir intenção/referência UUID imutáveis, revisão e recibo por solicitação. Reserva exclusiva por pedido abrange sinal/saldo e mudança de conta; UUID distinto não contorna reserva. Replay autorizado devolve recibo original antes dos gates atuais. Retirada local explícita somente com prova durável de que nunca houve claim de despacho; não representa cancelamento externo. Claim será persistido em i antes do POST; depois dele, timeout/ausência em consulta/queda não liberam reserva.
- **Pronto quando:** proprietário/calculista, vínculo/fase/conta, mesmoUUID e UUIDs distintos concorrentes, retirada permitida/recusada, imutabilidade/RLS/advisors e rollback/auditoria verificados. Coordenação com operações existentes fica em m; nenhuma interface autoriza emissão antes desse fechamento.

#### M3.01m Coordenação das reservas

- **Parte de:** M3.01h; depende de l.
- **Fazer:** evoluir por nova migration as RPCs de confirmação manual e condição contratual. Preservar replay/conciliação zero; bloquear novo recebimento positivo enquanto houver reserva pendente de resolução. Alteração de contrato confere todas as reservas do cliente, inclusive pedidos completed, após locks comuns e antes da flag; não presume cancelamento Asaas. Perfis ordenados → cliente → pedidos ordenados → pagamentos ordenados → configuração/contextos/intenção/reserva em todos os escritores.
- **Pronto quando:** intenção/manual/contrato nas duas ordens, replay antigo, reserva entre fases e conta, rollback e avisos/auditoria conferidos no banco. Sem POST/crédito novo/efeito externo; fechamento de h exige l/m verificadas.

#### M3.01i Executor fictício persistente

- **Parte de:** M3.01b; depende de h; execução técnica n → o → p, sem redução do escopo.
- **Fazer:** cliente/criação/consulta/conciliação pela porta fixture, fora de transação longa, com etapas/slots/contextos persistentes e retomada. Resultado indeterminado exige consulta; zero/404/múltiplos/incompleto não autoriza repetir POST. Comprovar resolução das cobranças anteriores antes de outra fase/emissão.
- **Pronto quando:** quedas pré/pós-despacho/resposta perdida ensaiadas sem duplicação; não declara autenticação/cancelamento reais nem depende de segredo.
- **Nota técnica para a execução:** 0059 mantém um claim por intenção e view com reserved/dispatch_claimed/withdrawn. Persistir runs/etapas/tentativas/resultados próprios e eventual resolução separada, preservando o claim/histórico; não reutilizar retirada pré-despacho como cancelamento. Transporte interno fixo com guarda local, sem callback livre/HTTP/segredo. Cobrança identificada não é recebimento: projeção/crédito seguem em j; consultas insuficientes conservam a reserva.

#### M3.01n Provedor fictício durável

- **Parte de:** M3.01i; depende de h.
- **Fazer:** transporte interno fixo, restrito ao servidor e explicitamente opt-in em loopback. Persistir cliente/pagamento fictícios, chave/fingerprint/recibo de transporte e invocações em transações curtas separadas da futura gravação de resultado. RPCs internas negadas a public/anon/authenticated e marker SQL desativado por padrão. Não usar IDs determinísticos ou unicidade de referência para esconder POST duplicado; referências iguais podem ter candidatos múltiplos. Falhas internas controladas só na fixture; notificações desativadas. Conta/ambiente/path/body conferidos, resposta sem logs de documento ou URL.
- **Pronto quando:** efeito fictício resiste à retomada por outro processo, replay da chave não cria novo efeito, fingerprint divergente conflita, duplicatas com chaves distintas aparecem na busca e contador de invocações permanece visível. Queda depois da criação, resposta inválida, indisponibilidade e listas insuficientes ensaiadas pela porta existente. Somente essa parte não prova um POST único pelo executor; isso é p.

#### M3.01o Bootstrap do cliente

- **Parte de:** M3.01i; depende de n.
- **Fazer:** operação persistente única por(scope_id,client_id) e snapshot fiscal privado antes de G. Binding existente exige GET coerente e notificações desativadas, sem substituição por404. Sem binding, candidato único permite vincular; lista zero completa com ausência comprovada de POST anterior permite somente primeiro POST. Após resultado incerto, consulta insuficiente não permite novo POST. Autoria humana da solicitação separada do processamento de sistema; nenhuma emulação de auth.uid por JWT fabricado.
- **Pronto quando:** jornada cria cliente sem binding pré-semeado, verifica/persiste o vínculo, prepara obrigaçãoG; concorrência/replay/queda/resposta perdida/doc ou conta alterados e autorização cruzada verificados sem cobrança ou crédito.
- **Nota técnica:** cada nova observação usa novo slot persistido; repetir o slot da busca inicial em N recupera o resultado antigo, inclusive zero. Repetir a mesma tentativa conserva sua chave. A prova de POST único vem das tentativas do produtor, não do replay do transporte. Worker atrasado não sobrescreve resultado mais recente; binding final usa INSERT e nunca substitui vínculo existente.

#### M3.01p Execução e retomada integradas

- **Parte de:** M3.01i; depende de n/o.
- **Fazer:** run/slots/tentativas/recibos por intenção e claim durável antes do POST, com locks perfis→cliente→pedido→pagamentos→configuração/contexto→intenção/reserva/run. Revalidar contexto/binding/reserva antes da primeira emissão; depois consultar conta/binding capturados. Token/revisão com fencing; replay ou lease vencido não autorizam POST incerto. Zero/404/múltiplos/incompleto/identidade divergente bloqueiam. ParaUNDEFINED aceitar método conhecido escolhido na observação, conservando o original. Resolução comprovada tem journal próprio e evolução da view sem apagar claim; cobrança identificada não é crédito e conserva reserva até resolução pertinente em j.
- **Pronto quando:** cliente→G→L→I→consulta/recibo íntegros; quedas pré/pós-claim/despacho/resposta/gravação, workers concorrentes/atrasados, retirada versus claim, histórico e nenhuma duplicação comprovados com contador durável de POST. Nenhuma operação real/financeira/HTTP externo. Parenti fecha somente depois de n/o/p verificadas.
- **Nota técnica:** usar a reserva autenticada já registrada como autorização durável do sistema, sem reutilizar helper dependente de auth.uid. Run único por intenção fornece run_id do claim; tokens/etapas mudam na retomada. Alocação não autoriza POST: start consumível grava claim permanente na mesma transação após reconferir contexto. Evoluir a view para resolução própria preservando claim e snapshots históricos de reserve/withdraw. ParaUNDEFINED, omitir tipo esperado nas consultas posteriores e guardar método conhecido observado separadamente, sem editarG/intenção. Ausência de recibo payment_create não prova não despacho, pois o adaptador verifica cliente antes do POST.

#### M3.01q Run e autorização de sistema

- **Parte de:** M3.01p; depende de o.
- **Fazer:** uma execução por intenção ligada à solicitação reserve autenticada e ao contexto. Locks de sistema próprios sem emulação de auth.uid. Snapshot privado de conta/cliente/binding; alocação de etapa com token/revisão, start consumível. Primeiro startcreate reconfere dívida/reserva/contexto e grava claim permanente com run_id da execução. Claim ou POST anteriorN força consulta; marcador não expira nem é removido. Getter humano mínimo/auditado, sem documento/recibo/URL.
- **Pronto quando:** cliente→G→L→run/start ensaiados no banco; concorrência, retirada versus start, replay, worker antigo, contexto alterado, autorização e rollback sem claim duplicado. Não envia nem observa pagamentos nesta parte; r/s continuam necessárias.

#### M3.01r Transporte e observação da cobrança

- **Parte de:** M3.01p; depende de q.
- **Fazer:** worker fixo servidor/local usa etapas deq e portaN fora da transação de estado. Persistir recibos/fatos imutáveis validados contra conta/cliente/referência/valor/método/data; novas consultas usam slots novos e finalização tem fencing. ParaUNDEFINED consulta aceita método conhecido selecionado, sem mudar original. Nenhum crédito/fila/download; resposta perdida exige consulta e nunca outroPOST.
- **Pronto quando:** perdas pré/pós-despacho/gravação, processo distinto, zero/404/múltiplos/incompleto/identidade divergente, método fixo/UNDEFINED e concorrência verificados com contador de invocações do produtor.
- **Nota técnica:** compartilhar wire/protocolo/identidade/fingerprint comN, persistindo expectativa antes do transporte. Ler receiptN original e confirmar scope/cliente/slot/op/requestID/payload/fingerprint. Reutilizar leitores lossless/F emTS; findPayment fornece lista, portanto normalizar candidato já validado por entrada interna deF, sem reconstruir decimais comvalueCents/100. RPCprivada liga fatos tipados à fonte imutável e verifica invariantes/fencing, sem aceitar dados do usuário ou duplicar parserfinanceiroSQL. UNDEFINED omite igualdade nas consultas mas permanece explícito na expectativa deF; método observado separado.

#### M3.01s Resolução e jornada completa

- **Parte de:** M3.01p; depende de r.
- **Fazer:** journal imutável de resolução no_dispatch_proven exige start consumido, receiptN payment_create explícito not_dispatched/payload capturado/sem efeito e ausência de outro despacho incerto. Resolução/estado terminal/liberação exata da reserva/auditoria atômicos, claim intacto. Atualizar view/DTO atuais sem exigir novos campos nos snapshots históricos. Nenhuma inferência por ausência,404/zero/deleted/status isolado; demais resoluções financeiras pertencem a j.
- **Pronto quando:** rollback/replay/histórico e nova emissão somente após resolução segura; cliente→G→L→I→consulta/recibo completos. Fechar p/i somente com q/r/s verificadas; operações reais continuam fora do preparo local.
- **Guardas de retomada:** histórico por UUID equivalente/global impede emissão; retirada préclaim preserva replay e permite apenas ausência de tentativa ou todos os não despachos explícitos coerentes, sem efeito. Claim sempre exige S. Produtor N exige reserva exata antes dos faults, mantendo replay, sob locks compartilhados com retirada.
- **Nota técnica:** journal privado único por intenção, solicitação estável e replay imutável. Resolver sob locks de execução exige protocolo/receiptN explícito not_dispatched/sem effect_id, startcreate consumido e claim do run; conferir outros receipts/autorizações pela referência, inclusive escopos divergentes. Liberar DELETE por order_id+intent_id com retorno exato de uma reserva, mantendo claim/histórico. Incrementar revisão/limpar current_step e reconhecer terminal antes da alocação impedem worker atrasado de desfazer resolução ou liberar reserva posterior. Views atuais admitem claim sem reserva somente com journal válido; schemas históricos de reserve/withdraw continuam aceitos sem campos novos. Ensaiar outro processo, perda/replay/rollback, retomada/finalização concorrentes e nova reserva sem binding pré-semeado; atualizar limpeza das fixtures antes dos FKs.

#### M3.01j Histórico e projeção comum

- **Parte de:** M3.01b; depende de g/h/i.
- **Fazer:** observações mínimas imutáveis e caso interno transacional de aplicação com recibo. Projeção comum preserva manual/histórico, inclusive parcelas sem recibo; bruto menos devolução/chargeback comprovados, sem taxa e sem dupla contagem. Parcial/excesso/incerteza separados. Adaptar sinal/instruções/condição contratual, fila, saldo e guarda de download/UI. Não desfazer trabalho ativo por inferência. C autentica o webhook e reutiliza esse caso, sem segundo ledger.
- **Pronto quando:** parcial/estorno/replay/ordem/rollback, manual concorrente, recibo/auditoria/avisos e todos os consumidores verificados. Falha na projeção não perde observação durável; nenhum efeito externo real.

#### M3.01t Observações e prova financeira

- **Parte de:** M3.01j; depende de i.
- **Fazer:** journal privado imutável por fonte durável/escopo/cobrança, ligado a R/N e à identidade da intenção, sem copiar documento/URL/body para domínio. Persistir observação em transação própria antes da aplicação; mesma fonte com fatos diferentes fica em conflito, nunca sobrescreve. Consultas novas usam slots/protocolos/fencing novos fora da transação de aplicação; comparação cumulativa não escolhe vencedor por timestamp. Reutilizar F/leitores lossless. Criar prova adicional fictícia tipada e ligada à fonte para montante/efetivação/reversão de chargeback; status isolado permanece incerto, formato externo condicionado à C.
- **Pronto quando:** duplicação/conflito entre fontes, contas distintas, perda/retomada/ordem/finalização antiga, ausências/404/deleted e chargeback desconhecido/comprovado/revertido verificados. Observação persiste mesmo se aplicação futura falhar. Sem crédito/fila/download nesta parte; u/v continuam necessários.

#### M3.01u Aplicação e projeção comum

- **Parte de:** M3.01j; depende de t.
- **Fazer:** posição cumulativa por escopo+provider_payment_id ligada unicamente à intenção/pedido/fase. Bruto confirmado menos devoluções concluídas e chargebacks efetivados comprovados; taxa não reduz crédito, pendência/ausência não vira zero. Função comum compõe manual confirmado com/sem recibo e posições do provedor; legado Asaas exige vínculo inequívoco, sem contar pagamento e recibo/posição duas vezes. Parcial/excesso/incerteza separados. Caso de sistema por ID da observação/revisão/solicitação, autoridade durável sem auth.uid fabricado, locks comuns e recibo/auditoria/evento/avisos transacionais. Resoluções financeiras têm journal distinto de S: terminal/fencing/liberação exata preservam claim; parcial/disputa/incerteza mantêm proteção. Estorno tardio continua observável depois da resolução.
- **Pronto quando:** manual/legado/cumulativo, taxa/excesso/devoluções/chargeback/reversão, fonte antiga/replay/rollback/concorrência e resolução com reserva posterior verificados. Falha em efeitos não remove observação; nenhum efeito externo real. v permanece necessária antes de fechar j.

#### M3.01w Motor e projeção cumulativa

- **Parte de:** M3.01u; depende de t.
- **Fazer:** motor puro de decisão sobre journal T, com prova de recebimento, refunds DONE e chargeback efetivo/reversões; taxa separada, valores seguros, parcial/excesso/incerteza e comparação sem timestamp vencedor. Preparar posição privada ligada a escopo/cobrança/intencão/pedido/fase e composição comum manual/posições/legado com identidade inequívoca. Consulta autorizada/auditada sem alterar snapshots v1. Cobertura por fingerprint do conjunto canônico de T, sem backfill cego: consultas abertas/UNKNOWN novos, fontes não consideradas e qualquer conflito durável impedem crédito disponível, conservando subtotal observado. Fonte antiga/same stale não confirma cobertura; guarda privada exige consulta atual equivalente para posição conhecida. Revisão de posição, chargeRevision e fingerprint separados para o futuro fencing de x, recuperados em uma leitura STABLE coerente; guard de escopo também somente leitura STABLE. Não aplicar STABLE no escritor transacional. Casos sintéticos explícitos não constituem aplicação comercial; writer transacional pertence a x.
- **Pronto quando:** centavos/fee/refunds/chargeback/reversão/ausência/ordem/histórico, manual com/sem recibo, legado vinculado/ambíguo/contas distintas, parcial/excesso/overflow e isolamento/RLS/replay da leitura verificados. U fica aberta; x permanece obrigatória.

#### M3.01x Aplicação, efeitos e resolução financeira

- **Parte de:** M3.01u; depende de w.
- **Fazer:** caso fixo de sistema por ID da observação/revisão/request, relendo T e motor w; autoridade durável sem auth.uid fabricado, locks compartilhados com manual, vínculo explícito/inequívoco do legado e posição cumulativa com recibo/auditoria/evento/avisos transacionais. Resolução financeira em journal distinto de S, terminal/fencing/liberação exata preservando claim e snapshots históricos. Parcial/disputa/incerteza conservam proteção; estorno tardio atualiza posição sem tocar reserva posterior. Definir tipos/avisos corretos para débito/conciliação sem reutilizar confirmação como estorno. Same stale é no-op, sem refresh de cobertura nem resolução; recalcular sob locks e conferir os três fences. Antes de liberar reserva por recebimento, fechar as guardas de escrita que ainda usam pagamentos v1 (manual/G/reserva/start) e usar projeção comum na liberação interna da fila, preservando snapshots históricos; demais consumidores e UI completos pertencem a v. Conflito sem fatos alternativos não é resolvido por timestamp nem apenas pela ordem da fonte original; requer mecanismo explícito auditado, conservando a proteção até essa prova.
- **Pronto quando:** recepção/aplicação/efeitos/resolução completos, replay/rollback/concorrência/manual/legado/ordem/reserva posterior e retomada em outro processo verificados. Falha da aplicação preserva T; avisos apenas por efeito novo e sem despacho real. Fechar u somente com w/x verificadas; V continua obrigatória antes de fechar J.

#### M3.01y Aplicação atômica da posição e efeitos

- **Parte de:** M3.01x; depende de w.
- **Fazer:** caso de sistema local fictício com observação/request como únicos dados do caller; posição/facts/efeitos recuperados e derivados no servidor. Replay do recibo imutável antes de fences; IDs divergentes recusados. Locks compartilhados profiles→cliente→pedido→pagamentos→intenção/contexto→cobranças/posição e três fences (posição, chargeRevision, fingerprint) conferidos antes do commit; leitura coerente STABLE, escritor VOLATILE. Same stale/ignore_old não alteram cobertura, avisos ou estado. Posição, recibo, auditoria, evento e avisos confirmam na mesma transação; falha preserva T. Débito/restauração/conciliação têm tipos próprios, sem usar recebimento como estorno; preferência do calculista e destinatário atual verificados. Helper interno da fila usa projeção comum, aceite+sinal comprovado ou contrato vigente, documento confirmado; não retroceder trabalho ativo.
- **Pronto quando:** recepção/hold/same/old, três fences, replay após resposta perdida em outro processo, concorrência, rollback de posição/recibo/evento/aviso/fila, contato/preferência/papel, subtotal/ausência/sem doublecount e guards/RLS verificados. Ensaios de 375/1440 comAxe para controles/linha do tempo afetados. Não resolve run nem libera reserva: z/aa continuam obrigatórias; x/u/j abertas.

#### M3.01z Resolução financeira e proteção dos writers

- **Parte de:** M3.01x; depende de y.
- **Fazer:** resolução financeira em journal separado de S, com prova conhecida/cobertura corrente, claim/terminal/revisão e DELETE exato da própria reserva. Evoluir views atuais sem alterar recibos/snapshots históricos. Antes de liberar reserva, comando manual/preparo G/reserva/start usa guardas da projeção para não emitir outro sinal já recebido ou incerto. Same stale não resolve; parcial/disputa/incerteza mantêm proteção. Estorno tardio altera somente posição/efeitos, não reabre POST/run nem toca reserva nova.
- **Pronto quando:** terminal versus workers atrasados, zero/uma reserva exata, claim preservado, replay e rollback, manual concorrente, guardas mínimas e estorno após reserva posterior verificados. aa e V seguem obrigatórias, sem driver externo.

#### M3.01ab Guardas financeiras antes de novo pagamento

- **Parte de:** M3.01z; depende de y.
- **Fazer:** preview G usa projeção comum W no shape v1: crédito/restante conhecido, settled/waived/excesso/legado e motivo explícito para incerteza, sem inventar total zero. Manual/G/reserva/start e último limite N conferem essa projeção sob locks profiles→cliente→pedido→payments→charges/query/posição, preservando replay e snapshots históricos. Cobertura por provedor não vira recebimento manual atribuído ao calculista. Reserva própria sem despacho continua permitindo primeiro start; qualquer claim/POST anterior conserva consulta e impede outro create. Não acrescentar campo obrigatório retroativo ao contexto v1. Não libera reserva ou resolve run.
- **Pronto quando:** provider satisfeito/incerto/parcial/excesso/legado, contexto antigo, recibos/replay, primeiro start, mudança entre claim/start/N e concorrência com Y/manual verificados; RLS/guardas e regressões passam. ab/ac obrigatórias antes de fechar z; AA/V continuam abertas.

#### M3.01ac Terminal financeiro e retomada

- **Parte de:** M3.01z; depende de ab.
- **Fazer:** journal financeiro privado/imutável distinto de S, comando fixo por IDs da aplicação/request; prova known/cobertura corrente/candidato W, locks/fences/claim/run, terminal e revisão/current_step, DELETE exato da própria reserva e auditoria na mesma transação. Replay precede reavaliação; zero/reserva divergente falha fechado. Views/DTO atuais e retomada reconhecem terminal financeiro antes de reservation_missing, sem alterar recibos/snapshots v1 nem S. Parcial/disputa/incerteza/same stale não resolvem. Estorno posterior entra por T/Y e conserva terminal/claim/reserva nova, sem reabrir POST.
- **Pronto quando:** zero/uma reserva exata, terminal versus claim/start/finish atrasados, resposta perdida em outro processo, request divergente, rollback após run/delete, resolução/manual concorrentes, UNKNOWN após aplicação e estorno depois de reserva posterior verificados. Fechar z somente com ab/ac completas; AA e V permanecem obrigatórias, sem driver externo ou decisão D5/D6.

#### M3.01aa Origem explícita do legado e aplicação integral

- **Parte de:** M3.01x; depende de z.
- **Fazer:** origem durável explícita do legado da fixture, vinculando linha antiga a scope/cobrança/intenção/pedido/fase sem inferir conta por provider_ref. Caso de sistema por IDs, recibo/auditoria/vínculo imutáveis e mesmo protocolo de locks/fences. Real origem/compatibilidade permanecem condicionadas a C; conflitos sem fatos alternativos conservam proteção até resolução auditada comprovada, sem apagamento ou vencedor por timestamp. Completar regressões/jornada transacional Y/Z/legado/efeitos/resolução.
- **Pronto quando:** mesma referência em contas distintas, ambiguidade, vínculo duplicado, manual/legado/worker concorrentes, perda/rollback/reserva posterior e jornada final verificados. Fechar x/u somente com y/z/aa completas; J depende também de V.

#### M3.01ad Origem fictícia durável e vínculo do legado

- **Parte de:** M3.01aa; depende de z.
- **Fazer:** produtor fixo local por IDs de T/N/R cria a representação histórica fictícia e sua origem privada explícita, sem escolher conta por referência; preservar scope/charge/intent/order/client/phase/receipt e snapshot mínimo da linha. Caso de sistema por IDs da origem/aplicação/request, com replay antes de reavaliação e releitura após locks/advisory, três fences e correspondência corrente. Vínculo, recibo, auditoria e reavaliação da fila comum ficam atômicos; identidade não transforma UNKNOWN/conflito em crédito conhecido nem repete aviso de recebimento. Proteger origem, vínculo e identidade da linha contra deriva ou remoção silenciosa; grants mínimos/RLS, limpeza restrita ao administrador do ensaio local. Conservar a posição única por charge e todos os snapshots históricos.
- **Pronto quando:** referência igual em contas distintas, origem ausente/cruzada, duplicação/request divergente, deriva UPDATE/DELETE, replay em outro processo, rollback e grants verificados; ordem Y→vínculo e vínculo→Y com fila/efeitos únicos protegida. Não resolve conflito sem fatos alternativos, não reabre terminal/POST, não decide origem real condicionada a C. AD/AE obrigatórias antes de fechar AA.

#### M3.01ae Jornada integral do legado com aplicação e resolução

- **Parte de:** M3.01aa; depende de ad.
- **Fazer:** verificar o protocolo completo T→Y→vínculo→AC e suas ordens válidas; manual/legado/T/Y/AC concorrentes, alteração de fences durante espera, parcial/excesso/refund/chargeback/UNKNOWN/conflito, documentos/contrato/fila e avisos deduplicados. Verificar recibos históricos, igualdade do terminal/claim antigo e proteção da reserva/claim posteriores; jornadas reais de cliente/calculista e acesso cruzado, com 375/1440 px/Axe/capturas nas telas afetadas.
- **Pronto quando:** todos os ensaios do escopo original AA passam, inclusive perda/rollback/reserva posterior e ordem Y antes/depois do vínculo. Fechar AA/X/U só com Y/Z/AD/AE completas; V permanece obrigatória para J. Não antecipar ativação externa, C ou decisões D5/D6.

#### M3.01v Consumidores e jornada financeira

- **Parte de:** M3.01j; depende de u.
- **Fazer:** todos os consumidores usam a projeção comum: obrigação G/L/I, sinal manual/instruções, contrato, upload/fila, lista da fila, saldo, entrega/download e UI. DTO atual não invalida snapshots v1: comparar projeção canônica histórica/versionar contexto novo, sem campos obrigatórios retroativos. Impedir instruções simultâneas diante de cobrança ativa/incerta. RF-34 continua aceite+sinal comprovado ou contrato+documento; não retroceder automaticamente trabalho ativo por estorno/incerteza. Guardas financeiras usam certeza, respeitando regra aprovada before_balance/after_balance. Avisos só por efeito novo, sem despacho real.
- **Pronto quando:** jornadas de parcial/conciliação/devolução/saldo em375/1440 comAxe/capturas e download real auditado/negado, acesso entre clientes e regressões manual/obrigação/reserva/entrega verificadas. Fechar j somente com t/u/v completas, sem decidir D5/D6 nem antecipar K/C/confirmação manual de saldoM3.09.

#### M3.01af Leituras financeiras atuais e apresentação

- **Parte de:** M3.01v; depende de u.
- **Fazer:** migrar instruções do sinal, lista da fila e instruções atuais do saldo para W, sem somar novamente linhas históricas. DTO de apresentação atual separado dos recibos/contextos v1; valores desconhecidos nulos, subtotal observado identificado, parcial/excesso/conciliação explícitos. Reserva/intenção ativa ainda sem charge também bloqueia instruções concorrentes. Preservar autoria, autorização por pedido/processo, paginação/filtros/uma obrigação por pedido, grants mínimos e confirmação manual somente quando elegível pelas guardas existentes. UI em português com tokens existentes; não apresentar zero como certeza nem saldo conhecido de outro momento.
- **Pronto quando:** parsers/regras de apresentação testados, leituras reais com manual/legado vinculado/parcial/excesso/refund/UNKNOWN/active sem charge/grants/acesso cruzado verificadas; sinal/fila/saldo exibidos em375/1440 comAxe/capturas,check/build dafonte exata/read-back/advisors confirmados. Os writers e a guarda de bytes ficam obrigatórios em AG/AH/AI,sem fecharV antecipadamente nem ativar cobrança real/C/K/M3.09.

#### M3.01ag Contrato e upload com fontes financeiras

- **Parte de:** M3.01v; depende de af.
- **Fazer:** contrato vigente e confirmação de arquivo usam mesma ordem profiles/client/order/payments/charges/queries/positions antes do lock do arquivo,compatível comY. Retirada de dispensa consulta W,sem soma de legado antigo; desconhecido não vira crédito. Replay mantém recibos anteriores,RF34 exige aceite+sinal/contrato+documento confirmado,efeitos/fila/avisos únicos e trabalho ativo não retrocede por estorno/incerteza.
- **Pronto quando:** concorrências reais contrato/upload/Y/T/manual com espera demonstrada/releitura/rollback/replay/capturas mínimas das telas passam;históricos/reservas/claims preservados,regressão/read-back/advisors/check confirmados. Sem alterar decisão comercial de contrato real nem liberar bytes fora deAH.

#### M3.01aj Regressões gerais de histórico e reserva

- **Parte de:** M3.01af/v; descoberta noCI34 após leituras atuais. Deve precederAH/AI.
- **Fazer:** adaptar histórico de entregas sem contexto aceito à conciliação, preservando61 registros/empates/microssegundos/cursor/retorno/uma obrigação porpedido/acesso. Ensaio de reserva deve verificar ausência de confirmação emleitura atual e manter a prova de ação sobre tela renderizada antes dareserva,com reenvio/UUID/payload/recibo econtrato protegidos. Limitar ações e assegurar limpeza após falha,sem remover lease ativo ou descartar casos. Investigar timeout geral somente após eliminar os erros causais. A suíte local revelou ainda mailpit.total como contagem global da caixa,com251 mensagens e busca vazia;validar limite pela contagem da busca messages_count,sem apagar mensagens deoutros destinatários ou exibir tokens/corpos de e-mail.
- **Pronto quando:** casos375/1440/Axe e limpeza após falha/regressões gerais passam,check/build/fonte exata/read-back/advisors verificados eCI completo sem cancelamento;preservar expectativas positivas comaceite/origem,sem backfill ou soma legada.

#### M3.01ak Limpeza do ensaio de download privado

- **Parte de:** M3.01aj; descoberta antes do código no read-back posterior aos191 navegador aprovados. O teste de download não tinha finally e deixouquatro arquivos fictícios dasduas execuções gerais,sem alterar os demais controles.
- **Fazer:** envolver upload/download/hash/TTL120s/auditoria/isolamento emtry/finally;remover somente a fixture de nome UUID/processo seed confirmado,comchecagem de cada operação e auditoria/evento file_uploaded restritos aoarquivo. O mesmo helper cobre o upload300MB e o download,sem apagar outros eventos do processo. Recuperar osquatro resíduos identificados,sem limpar a caixaMailpit ou dados de outro ensaio.
- **Pronto quando:** ensaio original passa375/1440/Axe;erro forçado depois do upload também deixa zero metadados/objeto/registro de auditoria/evento dafixture. Regressoes gerais191/7/read-back90/25/55RLS/controles idênticos aAG,check/fonteCI conferidos. AJ aguarda este filho para fechamento.

#### M3.01al Duração do CI com execução íntegra

- **Parte de:** M3.01aj; descoberta depois de corrigir os erros causais, como previsto na tarefa. Banco20min09s, navegador22min01s, preparação2min46s e advisors2s consumiram44min58s; limpeza/Supabase stop e upload ficaram sem margem. Todos os836/191 testes e advisors passaram, mas a execução cancelada não satisfaz o check obrigatório.
- **Fazer:** elevar somente timeout-minutes doe2e de45 para60. Preservar runner, suíte, omissões planejadas, limites deação/limpeza/locks e os demais checks. Rerodar integralmente emfonte imutável,comprovar checkout/pais/head,counts,advisors/cleanup/upload e sucesso terminal;sem alterar aplicações ou migrações paraencurtar teste.
- **Pronto quando:** CI integral da fonte final termina comsuccess e artefatos esperados após limpeza. AF/AJ/AK ainda aguardam este filho. O limite é orçamento para execuções comprovadamente necessárias,não autorização paracobrança ou serviços pagos.

#### M3.01ah Entrega e autorização de arquivos pela projeção

- **Parte de:** M3.01v; depende de ag.
- **Fazer:** migrar deliveryAccess/DTOs/queries/UI e can_read_delivery_file/RLS/rotas para mesma condição financeira deW conforme política capturada por entrega. before_balance/after_balance são ensaiadas como escolhas fictícias explícitas,sem decidirD6; certeza por fase,contrato vigente e valores aceitos precisam concordar. Condição não satisfeita nega novas leituras/URLs/bytes;preservar revisão/assinatura técnica capturada e recibos,já que estorno não apaga entrega nem reabre execução.
- **Detalhamento técnico antes do código:**
  - Regra pura e SQL usam a mesma projeção atual. Sem aceite reconhecido/valores seguros, não há liberação, mesmo com pagamentos manuais antigos ou contrato vigente. Em before_balance, contrato vigente dispensa o sinal; sem contrato, crédito certo do sinal deve atingir o valor exigido. Incerteza restrita ao saldo não substitui certeza do sinal. Em after_balance, contrato não dispensa o total: crédito total certo deve atingir o valor aceito. Excesso comprovado não inventa devolução nem novo Pix; dúvida ou valor inseguro conserva bloqueio.
  - Consultar cada entrega/pedido/política capturada/crédito em um contexto coerente, para cliente e calculista. O cliente vê a regra aplicada ao próprio pedido; calculista conserva acesso operacional. DTO atual é separado dos recibos históricos. Autorização, papel, dono e conjunto de IDs são conferidos, com limite50 e sem aceitar resultado parcial.
  - Leitores STABLE mantêm uma visão consistente; registro auditado VOLATILE adquire locks na ordem compartilhada de profiles/cliente/pedidos/pagamentos/fontes financeiras antes do arquivo, relê dono/papel/regra após espera e registra só acesso autorizado. Não inserir locks/escritas nos leitores STABLE. Referências: [volatilidade PostgreSQL17](https://www.postgresql.org/docs/17/xfunc-volatility.html) e [locks](https://www.postgresql.org/docs/17/explicit-locking.html).
  - UI/DTO/guarda RLS usam o mesmo contexto financeiro; instrução de saldo conserva uma obrigação por pedido e nunca oferece Pix diante de incerteza/reserva/excesso. URLs novas, conteúdo GET/HEAD/Range e download devem negar pedido que perdeu elegibilidade; respostas privadas usam no-store. Preservar URL120s já prevista, sem prometer revogação retroativa de uma URL emitida anteriormente.
  - Fixtures técnicas sem aceite continuam negativas, sem backfill silencioso. Corrigir a expectativa antiga de metadados liberados por soma manual; conservar positivos em fixture explícita com aceite e fontes elegíveis. Exercitar ambas políticas, dispensa porcontrato, parcial/UNKNOWN/refund/restauração/excesso, fases separadas e acesso clienteB/admin/anon. Preservar revisão e dados técnicos, recibos/replay, reservas posteriores, checksum/bytes/auditoria e teste real de espera/rollback.
  - Diagnóstico atual executado na fonte e2342ce:um teste real de delivery-approval passou/duas omissões por filtro; suas próprias asserções comprovam saldo null e quatro metadados liberados pela soma antiga. Isso identifica a divergência anterior, sem provar bytes ou correção. Evidência: docs/evidencias/pagamentos/liberacao-entregas/diagnostico-legado.json. AJ/AK/AL foram confirmadas noCI37 integral dafonte81b7026;AH pode prosseguir depois de concluir o preparo dafonte do simulador, sem alterar a identidade comercial ou decidirD6.
- **Pronto quando:** ambas políticas econtrato/sinal/saldo/UNKNOWN/parcial/excesso/estorno/restauração verificados em regras puras,SQL eUI;download positivo porURL120s/bytes/auditoria e negação conteúdo/download/RLS/clienteB reais,regressão/locks/read-back/advisors/check confirmados. Fixtures sem aceite/origem não recebem certeza por backfill.

#### M3.01ai Jornada final dos consumidores financeiros

- **Parte de:** M3.01v; depende de af/ag/ah.
- **Fazer:** percorrer produtores reais dafixture econsumidores atualizados,incluindo sinal parcial/conciliação/devolução/excesso/saldo,dispensa porcontrato eambas políticas fictícias. Nova reversão comprovada pode recompor crédito sem apagar débito/reversões anteriores,nem inventarPix. Reserva/claim/run/POST reais posteriores e todos os snapshots históricos permanecem protegidos. Exercitar recibos/perda/replay/rollback/fila-avisos/estorno após trabalho ativo,375/1440/Axe/capturas,bytes/auditoria/acesso cruzado.
- **Pronto quando:** escopo originalV inteiro passa comAF/AG/AH/AI efontes exatas verificados;fecharV/J apenas comtodos os filhos obrigatórios e T/U completas. C/K/driver externo/D5/D6/confirmação manual de saldoM3.09 eativação real conservam suas condições próprias.

#### M3.01k Fatura do proprietário e jornada

- **Parte de:** M3.01b; depende de g/h/i/j.
- **Fazer:** cobrança/reconciliação do proprietário via authorize/binding atual/auditoria; URL validada somente na resposta autorizada, sem logs. Estados ativos/pagos/bloqueados/incertos explícitos.
- **Pronto quando:** acesso cruzado e identidade/valor/URL insuficientes recusados; jornada cliente/calculista em 375/1440 px com perda/replay/rollback, sem driver externo. Parentb fecha só depois das cinco partes. Confirmação manual de saldo e cobrança before_balance continuam no escopo próprio de M3.09.

#### M3.01c Webhook e jornada sandbox

- **Fazer:**
  1. Preparar entrada privada autenticada conforme mecanismo oficial, persistência durável e deduplicação por conta/ambiente/ID do evento; rejeitar token/identidade inválidos antes do processamento.
  2. Processar de forma retomável e tratar duplicação/ordem invertida. Conferir pagamento contra cobrança/pedido/cliente/valor; consultar provedor quando o evento não for suficiente para decisão segura.
  3. Aplicar crédito transacionalmente às regras de aceite, documento, contrato e fila; webhook não aprova termos, simulações, D6 ou revisão técnica.
  4. Testar rollback, reenvio, pagamento manual concorrente, parcial, taxa, estorno/chargeback e eventos de outra conta/ambiente com transporte fictício.
  5. Depois de Fábio configurar conta/credenciais sandbox do cliente, ensaiar Pix/boleto/cartão pelos mecanismos autorizados do sandbox e conferir emissão, evento, crédito e fila. Registrar somente IDs e resultados sanitizados.
- **Pronto quando:** testes locais/isolamento/servidor e jornada em 375/1440 px passam; ensaio no sandbox real confirma fatura/webhook/reconciliação para os meios aprovados.
- **Dependências:** M3.01b; conta/credenciais sandbox, endpoint e autorização do ensaio externo. Migration de nuvem e configuração de webhook são ações externas identificadas, não consequência implícita de testes locais.

#### M3.02 Controle do pagamento automático

- **Fazer:**
  1. Criar comando exclusivo do calculista, desligado por padrão, com confirmação, revisão concorrente, UUID/recibo e auditoria; ligar exige configuração operacional válida do ambiente.
  2. Desligar impede novas emissões automáticas, conservando cobranças emitidas e processamento de seus webhooks.
  3. Conferir cobrança ativa/conciliação antes de oferecer Pix manual, evitando duas instruções simultâneas para a mesma dívida.
- **Pronto quando:** papéis indevidos são recusados, falha preserva escolha, replay antigo não desfaz alteração nova e desligamento durante emissão/pagamento não perde evento nem duplica cobrança; navegador/axe em 375/1440 px aprovados.
- **Dependências:** M3.01; RF-31. Uso em produção também exige M3.03.

#### M3.03 Ativação Asaas em produção

- **Fazer:**
  1. Preparar checklist de titular/CNPJ/destino, segregação de ambientes, referências de segredos, webhook, observabilidade e retorno ao modo manual. Fábio configura variáveis de produção.
  2. Obter autorização específica para ensaio controlado em produção, com pagador, valor e destino definidos. A aprovação de M3.00 não autoriza cobrança real.
  3. Executar o ensaio autorizado e conferir cobrança, webhook, crédito, documento/fila e conciliação; comprovar que sandbox não altera produção.
- **Pronto quando:** identidades e autorização registradas, pagamento real autorizado conciliado de ponta a ponta e monitoramento/retorno ao manual verificados.
- **Dependências:** M3.01/02; confirmação manual do saldo verificada em M3.09 para retorno ao manual; D9; conta, credenciais e operação comercial aprovadas; M2.35. O GATE M3 exige webhook de produção, mas a regra geral limita pagamento a sandbox até o GATE: resolver por autorização específica deste ensaio, sem marcar o GATE antecipadamente.

#### M3.04 Contrato PDF no aceite

- **Fazer:**
  1. Congelar identificação do contratante na transação do aceite, junto à proposta/textos/recibo. Para aceite histórico sem esses dados, usar somente o que foi efetivamente registrado e informar a lacuna; não reconstruir a identidade pela edição atual do perfil.
  2. Gerar contrato a partir dos snapshots imutáveis com serviços/valores, nome/CRC/categoria, versões e prova do aceite.
  3. Registrar intenção de geração com o aceite; processar idempotentemente, arquivar bytes/SHA e associação única à proposta aceita. Mostrar geração pendente/falha e download privado auditado.
  4. Ensaiar PDF longo com dados fictícios e inspecionar texto, paginação e identificação. Mudanças posteriores de perfil/termos/settings não mudam o contrato histórico.
- **Pronto quando:** PDF conferido, geração/resposta perdidas não repetem aceite, histórico é imutável e outro cliente/proposta recusada/simulada não obtêm contrato.
- **Dependências:** M3.00; M2.15; produtor comercial M2.12 e textos aprovados M2.03; RF-30/RN-01/02. O contexto existente congela proposta/textos, mas não toda a identificação fiscal do contratante.

#### M3.05 Garantia e reembolso

- **Fazer:**
  1. Obter política aprovada com duração/termo inicial, critérios de elegibilidade/culpa e efeitos da espera do cliente; versionar e capturar na contratação. Atraso isolado não prova culpa.
  2. Registrar fatos, avaliação, responsável/motivo e decisão conforme política. Preparar estados solicitado, em processamento, recusado e devolvido comprovado.
  3. Criar solicitação/recibo e conciliação do reembolso: provedor para pagamento Asaas e procedimento manual comprovado para Pix manual. Respeitar limite devolvível, parcial/total e preservar eventos históricos.
  4. Testar atraso atribuível/indeterminado, dupla tentativa, falha, parcial e confirmação tardia. Publicação de política e devolução real requerem autorização específica.
- **Pronto quando:** D5/texto aprovados, cenários fictícios passam e política publicada/execução autorizada têm evidência; pedido de devolução não é tratado como dinheiro devolvido.
- **Dependências:** M3.00; D5; calendário/prazo e D11 quando pertinente; textos jurídicos aprovados; M3.01 para reembolso Asaas. M2.12a recusa sem contratação/pagamento não é reembolso.

#### M3.06 Revisão na garantia

- **Fazer:**
  1. Criar formulário do proprietário vinculado ao pedido/entrega original, com motivo e anexos privados.
  2. Conferir no servidor entrega revisada, política capturada e janela de garantia; registrar UUID/recibo, evento e aviso.
  3. Aplicar ajuste conforme regra aprovada e exigir nova revisão para nova entrega. Conservar aceites, pagamentos e arquivos anteriores, sem cobrança automática nova.
  4. Confirmar com André a disponibilidade das entregas históricas durante o ajuste: hoje `in_adjustment` bloqueia seu download; não mudar essa regra implicitamente.
- **Pronto quando:** proprietário solicita, outro cliente/não entregue/janela inválida são recusados; limites de data, concorrência e resposta perdida não duplicam; jornada ajuste → revisão → nova entrega verificada.
- **Dependências:** M3.00; M3.05; M2.26; M2.19a; RF-63/RN-03/09; definição de acesso histórico durante ajuste.

#### M3.07 Ajuste manual e sucessão de propostas

- **Fazer:**
  1. Permitir calculista ajustar somente a proposta vigente de pedido `quoted`, sem contratação, pagamento ou recibo de recusa, com motivo obrigatório; conservar tabela-base e valores anteriores/novos. Não reabrir pedido recusado/cancelado como ajuste.
  2. Criar versão/contexto/PDF novos com sucessão explícita; recomputar itens/total/sinal/saldo em centavos e manter discriminação.
  3. Proteger revisão/UUID/recibo, evento/auditoria/aviso. Aceite, recusa e ajuste disputam o pedido; versão substituída não pode contratar nem cancelar a nova. Atualizar getters/RPCs de aceite/recusa de forma coordenada para a versão vigente: a guarda atual de 0051 exige uma única proposta por pedido e não pode simplesmente aceitar múltiplas versões sem sucessão comprovada.
  4. Preservar PDF e prova anteriores; não editar proposta aceita nem pagamento existente.
- **Pronto quando:** fechamento dos valores/motivo conferidos, papéis/conflitos falham, disputas ajuste/aceite e ajuste/recusa têm um vencedor e replay não cria versão adicional; nova versão pode aceitar e recusar pelas guardas corretas, antiga conserva leitura/recibos sem efeito sobre a vigente.
- **Dependências:** M3.00; M2.12/15/12a; RF-26/RN-01/06. Imutabilidade atual não substitui vínculo explícito de sucessão.

#### M3.08 Validação da assinatura ICP-Brasil

- **Fazer:**
  1. Escolher/documentar mecanismo hospedável e autorizado, critérios de cadeia/revogação/referência temporal e uso privado da identificação do signatário; não presumir API disponível a partir do site público VALIDAR.
  2. Conferir assinatura PAdES presente, integridade, cadeia ICP-Brasil, referência temporal/revogação e CPF correspondente ao André; associar resultado ao arquivo/versão/SHA, mecanismo/data e relatório privado.
  3. Bloquear confirmação da entrega se ausente/inválida/indeterminada; troca de bytes exige nova validação. Revisão explícita do André continua obrigatória.
  4. Testar sem assinatura, adulteração, cadeia não confiável, signatário diferente, indisponibilidade de revogação e resultado de outro hash com fixtures criptográficas. Fixture sintética não comprova certificado ICP-Brasil real.
  5. Realizar ensaio autorizado com certificado/arquivo reais em armazenamento privado; não guardar CPF/certificado/processo no Git nem enviá-los a terceiro sem autorização.
- **Pronto quando:** negativos/indeterminados bloqueiam, resultados estão vinculados ao hash correto e ensaio real comprova mecanismo ICP-Brasil com evidência sanitizada.
- **Dependências:** M3.00; M2.26; D6; identificação privada/mecanismo aprovados. Referências a conferir: [critérios do ITI](https://validar.iti.gov.br/Docs/cartilha-de-uso.pdf), [guia do desenvolvedor](https://validar.iti.gov.br/guia-desenvolvedor.html).

#### M3.09 Cobrança do saldo na entrega

- **Fazer:**
  1. Gerar uma obrigação de saldo por pedido na entrega: total contratado menos créditos elegíveis confirmados, líquidos de estornos/chargebacks e sem descontar taxas do provedor. Triagem só abate conforme D5. Cliente com contrato sem sinal deve o total remanescente, não 50% fixos.
  2. Cobrar também na política que permite download antecipado; reutilizar a regra capturada por entrega e aprovação individual de legado. Webhook não decide D6 nem altera a regra.
  3. Reconciliar pagamentos manuais/automáticos concorrentes, estornos, várias entregas e replay; não emitir outra dívida pelo mesmo saldo.
  4. Antes de emitir saldo, reconciliar cobranças/intenções de sinal ativas/incertas, inclusive após marcar cliente com contrato. Definir procedimento seguro de reutilização/substituição/cancelamento comprovado para impedir duas faturas pagáveis sobrepostas; bloquear emissão enquanto o resultado for incerto. Evento tardio de sinal exige reconciliação, não nova cobrança às cegas.
  5. Ampliar instruções de cobrança hoje restritas a `after_balance`, conservando as guardas de download existentes.
  6. Criar confirmação manual do saldo pelo calculista, com restante calculado no servidor, UUID/recibo, revisão concorrente, autoria/auditoria e a mesma projeção de crédito. O comando atual confirma apenas sinal; a ponte SQL sintética da jornada não é fluxo de saldo e não pode ser usada em operação real.
- **Pronto quando:** ambas as políticas, contrato sem sinal, centavo ímpar, parcial, estorno e concorrência passam; caso sinal pendente → cliente com contrato → entrega e pagamento tardio concorrente/resposta perdida não cria cobranças sobrepostas; modo automático desligado permite confirmar saldo e liberar conforme regra pela UI, sem SQL administrativo; download antecipado mantém cobrança devida.
- **Dependências:** M3.00; M3.01/02; M2.26/27; D6; RF-35/32.

#### M3.10 Nova versão do PDF e páginas já lidas

- **Fazer:**
  1. Relacionar cada nova versão ao PDF anterior do mesmo processo, preservando arquivos, hashes e índices. Nome igual ou número da página não prova correspondência.
  2. Definir com André a marcação de página lida e a confirmação da correspondência. Adotar conferência manual neste marco; leitura/classificação por IA pertencem ao M4.
  3. Reaproveitar somente páginas cuja correspondência foi confirmada; destacar páginas novas ou alteradas. Inserção, exclusão, reordenação e páginas escaneadas mantêm incerteza até a conferência.
  4. Copiar referências após confirmação, conservando arquivo/página de origem, responsável e data. Registrar evento/auditoria, revisão concorrente e recibo de reenvio.
- **Pronto quando:** duas versões fictícias com inserções, remoções e reordenação preservam o original, não herdam referências incorretas e mostram o que precisa de leitura; isolamento, replay e navegador/axe em 375/1440 px aprovados.
- **Dependências:** M3.00; M2.18/20/24; definição do André sobre marcação/correspondência. Hoje existe índice por `file_id` e campo `version`, sem cadeia explícita entre PDFs.

#### M3.11 Atualização sobre o .PJC guardado

- **Fazer:**
  1. Criar pedido de atualização na pasta existente, vinculado ao pedido/cálculo anterior escolhido pelo cliente proprietário.
  2. Selecionar .PJC confirmado e autorizado daquele processo, conservando a entrega original. Se ausente, permitir informar a ausência e solicitar envio.
  3. Reaproveitar checklist como rascunho identificado; exigir revisão dos campos e nova data-base. Índice e decisões conservam origem; alterações exigem novo registro.
  4. Usar tabela vigente para nova proposta, sem reutilizar aceite/sinal antigos. Percorrer as regras existentes de contratação, documentos, fila, revisão e entrega.
- **Pronto quando:** atualização fictícia conserva pedido/.PJC originais, exige revisão, cria nova proposta e não referencia arquivo de outro cliente; replay, concorrência e jornada aprovados.
- **Dependências:** M3.00; M3.10 para reaproveitar PDFs; M2.08/12/15–19/26. Preços, calendário, período e disponibilidade aprovados antes de uso real. Hoje há tipo `update` e pasta com vários pedidos, sem comando de atualização e vínculo verificável ao .PJC anterior.

#### M3.12 Concordância técnica na recorrência

- **Fazer:**
  1. Reaproveitar RF-47 implementado em M2.23: confirmação explícita do proprietário, ator/data imutáveis, RPC idempotente e inclusão no PDF.
  2. Conferir que a concordância continua vinculada ao conteúdo original. Referência reaproveitada não autoriza concordância automática com decisão nova ou modificada.
  3. Repetir regressões de propriedade, concorrência, replay, imutabilidade, evento/auditoria e exportação depois de nova versão e novo pedido.
- **Pronto quando:** somente o proprietário confirma, repetição não duplica a prova e conteúdo novo não recebe concordância indevida; evidência registrada para os cenários de recorrência.
- **Dependências:** aprovação do reaproveitamento em M3.00; M2.23; M3.10/11. Manter aberta até verificar a extensão; não criar segunda confirmação.

#### M3.13 GA4, consentimento e Search Console

- **Fazer:**
  1. Confirmar propriedade GA4/Search Console na conta-mãe do cliente e o domínio autorizado; Fábio configura os acessos.
  2. Oferecer aceitar, recusar e rever consentimento com acessibilidade. Usar o modo básico: nenhum carregamento/envio ao Google antes de aceitar. Conferir a [documentação oficial do Consent Mode](https://developers.google.com/tag-platform/security/concepts/consent-mode) na implementação.
  3. Medir somente páginas públicas e eventos aprovados com URLs/parâmetros sanitizados. Excluir áreas `/app`/`painel`, CNJ, documentos, contatos, CPF/CNPJ, textos livres, tokens e identificadores privados.
  4. Verificar Search Console pelo método autorizado e sitemap de páginas públicas. Mudança de DNS exige ordem própria do Fábio.
- **Pronto quando:** testes de rede comprovam ausência de envio antes de consentimento/depois de recusa, aceitação/revogação funcionam, eventos sanitizados chegam ao GA4 e Search Console confirma propriedade. Estado/cidade aparecem como agregado disponível, sem promessa de precisão individual.
- **Dependências:** M3.00; conta Google, domínio e política aprovados. Preparar transporte fictício não comprova recebimento real no GA4.

#### M3.14 Simulador público sem cadastro

- **Fazer:**
  1. Definir com André campos mínimos do checklist curto, sem documentos, dados pessoais ou número do processo.
  2. Reutilizar motor determinístico e projeção pública mínima da tabela ativa aprovada. Mostrar itens, premissas, centavos e versão.
  3. Identificar resultado como estimativa; encaminhar ao cadastro/checklist completo antes de proposta/contratação. Não prometer prazo sem calendário e disponibilidade confirmados.
  4. Bloquear uso comercial de tabela fictícia e conservar a demonstração identificada como fictícia.
- **Pronto quando:** mesmas entradas/versão produzem mesmos centavos, adicionais estão discriminados, não há contratação nem configuração privada exposta e navegador/axe passam em 375/1440 px.
- **Dependências:** M3.00; M2.07/09/11/33; campos/textos aprovados. O motor e a demonstração existentes não comprovam simulador comercial.

#### M3.14a Preparo local do simulador público

- **Parte de:** M3.14; independente da validação AJ/AK/AH, com mesma aprovação local fictícia deM3.00. Não fecha os insumos deM2.07/33 nem os campos/textos definitivos.
- **Fazer:** extrair cálculo depreço sem prazo do motor existente, mantendo calculateQuote compatível;projeção pública mínima da tabela ativa (version/isExample/base/adicionais),sem businessDays/calendário/Pix/contatos/IDs privados. Formulário curto fictício usa tipo,qtd de verbas/meses/reclamantes,cartões e urgência;não coleta CNJ/documentos/contatos nem persiste respostas. Resultado discrimina itens,valor/versão/premissas,é estimativa e encaminha ao cadastro/checklist completo. Tabela exemplo gera somente demonstração identificada;ausência/tabela inválida não inventa orçamento. Nome/CRC/categoria seguem identificação pública,fictícios na demonstração.
- **Condição confirmada no schema:** tabela exemplo não pode ser ativa (constraint price_tables_activation). A rota comercial consulta somente tabela ativa real; demonstração usa rota própria e a tabela demo-2026-v1 explicitamente fictícia, com projeção mínima. Sem tabela/identificação aprovadas, a rota comercial informa indisponibilidade, sem fallback fictício. O preparo local não afirma aprovação final dos campos/textos/preços.
- **Pronto quando:** preço equivale ao motor completo nas mesmas entradas/tabela,determinismo/limites/centavos e isolamento daprojeção passam;RPC público só revela whiteliste sem dar select emtabela privada;375/1440/Axe/QA e rede sem contratação/persistência de dados,check/read-back/advisors dafonte confirmados. M3.14 comercial permanece aberta paraaprovações/publicação próprias.

#### M3.15 Indicadores do André

- **Fazer:**
  1. Aprovar definições, período e denominadores de cadastros, propostas comerciais, conversão, recebimentos confirmados líquidos de estornos, prazo médio e entregas no prazo. Proposta emitida não é receita.
  2. Excluir simulações, separar dado ausente de zero e conservar prazo prometido/timestamps usados na medição.
  3. Calcular agregados no servidor, exclusivos do calculista, com filtros antes da agregação e America/Sao_Paulo.
  4. Mostrar origem somente após M3.13, como agregado de analytics separado dos dados de processo.
- **Pronto quando:** conjunto fictício conhecido, incluindo parcial/estorno/recusa e informação ausente, reconcilia com fórmulas aprovadas; isolamento, desempenho e navegador verificados.
- **Dependências:** M3.00; M2.32; dados confiáveis de proposta/pagamento/entrega e fórmulas aprovadas; M3.13 para origem. As seis contagens atuais são operacionais.

#### M3.16 Avaliação e convite para o Google

- **Fazer:**
  1. Permitir ao proprietário avaliar pedido entregue com nota 1–5 e comentário; proteger repetição/concorrência e definir com André se haverá edição.
  2. Guardar avaliação privada e disponibilizá-la ao André. Publicação de depoimento exige autorização própria.
  3. Oferecer convite neutro para perfil Google confirmado independentemente da nota interna, sem incentivo ou pressão por avaliação positiva; conferir a [política oficial](https://support.google.com/contributionpolicy/answer/7400114).
  4. Eventual convite por mensagem usa fila, deduplicação e texto aprovado; envio real depende da autorização e do provedor do projeto.
- **Pronto quando:** apenas dono de pedido entregue avalia; acesso cruzado, duplicidade e entrada inválida são recusados; convite funciona para notas baixas/altas sem publicar comentários privados.
- **Dependências:** M3.00; M2.26; perfil Google e textos aprovados; M2.28 para e-mail. Existe tabela `reviews` com RLS; falta formulário/caso de uso.

#### M3.17 Sugestões pelo DataJud

- **Fazer:**
  1. Consultar pelo servidor após validar CNJ/tribunal, com endpoints oficiais e referência de credencial no cofre. Testes usam respostas/processos fictícios.
  2. Mapear tribunal, órgão julgador/vara, classe e movimentos disponíveis, preservando fonte/data. Conferir [acesso](https://datajud-wiki.cnj.jus.br/api-publica/acesso/) e [glossário](https://datajud-wiki.cnj.jus.br/api-publica/glossario/) oficiais; metadados não substituem documentos ou decisões.
  3. Exibir sugestões para conferência antes de salvar; não sobrescrever edição manual nem escolher silenciosamente resultado ambíguo.
  4. Tratar ausência, incompletude, indisponibilidade e timeout conservando preenchimento manual. Ausência de resultado não comprova inexistência/sigilo.
  5. Não derivar prazo processual, mérito ou decisão técnica dos movimentos; logs sem CNJ, payload integral ou credencial.
- **Pronto quando:** respostas completas/vazias/ambíguas e falhas mantêm o formulário utilizável; gravação exige conferência, credencial permanece no servidor e isolamento é verificado.
- **Dependências:** M3.00; M2.08; configuração DataJud e campos aprovados. O checklist valida CNJ/TRT/vara; não existe cliente DataJud nem proveniência persistente de classe/movimentos.

#### M3.18 Contrato de operador e retenção

- **Fazer:**
  1. Preparar minuta e matriz de tratamento com finalidade, responsáveis, classes de dados, exportação, retenção, exclusão e suspensão por litígio; revisão jurídica/humana e D8 continuam necessárias.
  2. Definir critérios separados para arquivos/versões, cadastro, mensagens, auditoria, contratos, pagamentos e recibos. Exclusão de documento não apaga em cascata provas ou recibos necessários para impedir replay.
  3. Implementar seleção determinística local, simulação, bloqueio por litígio e execução em lotes com recibo, concorrência e recuperação de falha entre banco/Storage. Não excluir pedido ativo nem presumir que entrega encerra o processo.
  4. Auditar identificadores/motivos mínimos sem conteúdo ou URL; definir expiração de backups e reaplicação das exclusões após restauração.
  5. Preparar job autenticado. Ativação e primeira exclusão real exigem autorização específica, política juridicamente aprovada e restauração de M3.22 verificada.
- **Pronto quando:** contrato/política aprovados, guarda por litígio/replay/concorrência/recuperação testados e job autorizado elimina somente elegíveis com evidência sanitizada.
- **Dependências:** M3.00; D8; M2.03/06; recibos de M2.15/16/19a; M1.51/52. M3.22 exige política aprovada desta tarefa, mas não a execução destrutiva, evitando dependência circular.

#### M3.19 MFA e recuperação

- **Fazer:**
  1. Conferir opções atuais do Supabase Auth e preparar inscrição/desafio/validação local para calculista e administração.
  2. Exigir autenticação suficiente no servidor/casos de uso/RPCs privilegiados; testar sessão antiga, acesso direto, inscrição incompleta e troca de papel.
  3. Aprovar recuperação antes da exigência: responsável, prova de identidade, autorização, auditoria e reinscrição. Não presumir códigos de recuperação oferecidos pelo provedor.
  4. Ensaiar perda/recuperação com contas fictícias. André/Fábio cadastram fatores reais e os guardam no cofre só de pessoas.
  5. Alteração Auth/inscrição real/exigência em produção requer autorização específica. Nenhum QR, segredo TOTP ou código aparece no chat, captura, Git ou log.
- **Pronto quando:** servidor nega operação privilegiada sem segundo fator, recuperação autorizada foi ensaiada e responsáveis confirmaram inscrição/acesso reais.
- **Dependências:** M3.00; M1.43; M2.35; contas e recuperação humana aprovadas.

#### M3.20 Consulta da auditoria de arquivos

- **Fazer:**
  1. Mostrar ao André consulta paginada com filtro por arquivo/período/autor/ação e ordem estável por data/UUID.
  2. Exibir somente autor autorizado, horário, ação e referência; não incluir conteúdo, token, URL assinada ou payload bruto.
  3. Proteger pelo papel/escopo sem ampliar o acesso administrativo a documentos definido em D13.
  4. Verificar visualização, HEAD/Range e download auditados, paginação e negação aos demais papéis conforme suas permissões.
- **Pronto quando:** André recupera registros do ensaio autorizado, isolamento/paginação e navegador/axe em 375/1440 px passam.
- **Dependências:** M3.00; RN-11; D13; M2.18/20/27. Não requer política global mais ampla.

#### M3.21 WhatsApp oficial com consentimento

- **Fazer:**
  1. Criar consentimento específico separado dos termos, com texto/versão, número normalizado, data/origem e retirada.
  2. Usar adaptador oficial e fila; revalidar consentimento/destinatário no despacho e em cada tentativa. Retirada cancela pendentes pertinentes e conserva histórico enviado.
  3. Enviar apenas código do pedido, data e link autenticado do portal; sem processo, partes, documentos ou URL assinada de arquivo.
  4. Testar opt-in/opt-out, troca de número, replay, concorrência e falha com transporte fictício.
  5. Fábio aprova/configura conta Meta, número, templates, custos e variáveis. Mesmo envio real de teste exige autorização registrada do destinatário/conteúdo.
- **Pronto quando:** retirada impede novos despachos, retry não duplica e teste real autorizado chega ao destinatário correto com conteúdo aprovado.
- **Dependências:** M3.00; RF-72/RN-07; D7; M1.51; M2.29/31; textos aprovados.

#### M3.22 Backup externo e restauração

- **Fazer:**
  1. Conferir alcance do backup do banco e aprovar destino externo privado do cliente, periodicidade, retenção, criptografia, responsáveis/alertas. Não escolher plano pago sem aprovação.
  2. Preparar cópia incremental com manifesto de arquivo/versão/tamanho/hash; conferir bytes e recuperação de cópia interrompida. Segredos ficam no ambiente/cofre autorizados.
  3. Associar manifesto ao ponto de restauração do banco, conservando vínculos, metadados e recibos de idempotência.
  4. Ensaiar localmente com arquivos fictícios. Restauração externa requer destino isolado aprovado e identidade/acesso próprios, confirmados antes da operação.
  5. Conferir método/efeitos antes da restauração: clone físico pode iniciar extensões externas imediatamente e não permite pausá-las previamente; quando necessário, usar restauração lógica revisada que impeça esses efeitos antes da execução. Manter cron/envios isolados; reaplicar exclusões/restrições posteriores e verificar RLS, hashes, versões, download autorizado/negado e ausência de replay de cobrança/aviso.
  6. Documentar ensaio mensal e resposta a falha sem substituir a produção.
- **Pronto quando:** cópia externa autorizada existe, arquivos restaurados conferem por hash, vínculos/permissões/replays passam e rotina tem responsável.
- **Dependências:** M1.44/52; política aprovada de M3.18; destino/custo/credenciais aprovados pelo Fábio. Não depende de exclusão real já ativada.

#### M3.23 Entrevistas com advogados

- **Fazer:**
  1. Preparar roteiro para 10–15 advogados de SP/MG: frequência, dor, documentos, prazo, orçamento, objeções, experiência e confiança.
  2. André/Fábio selecionam/entrevistam; contatos, convites, gravações ou mensagens do agente exigem autorização explícita.
  3. Consolidar respostas autorizadas com método/contagem, separando observação, hipótese e recomendação. Identidades/relatos ficam privados; Git recebe roteiro e síntese anonimizada.
  4. Propor decisões de preço/escopo sem ativá-las.
- **Pronto quando:** 10–15 entrevistas concluídas, síntese conferida e decisões/pendências registradas. Preparar roteiro não conclui a tarefa.
- **Dependências:** M3.00; roteiro aprovado; execução humana de André/Fábio.

#### M3.24 Cliente oculto

- **Fazer:**
  1. Preparar cenário fictício padronizado e ficha para Office Perícia, MH Cálculos e Lagares: serviço, preço, sinal, prazo, garantia, atendimento e entregas.
  2. Fábio realiza contatos/solicitações. Não usar processo real; mensagens, pagamentos ou envios pelo agente exigem autorização específica.
  3. Consolidar evidências com data/condições/lacunas; não comparar como equivalentes preços de serviços diferentes.
- **Pronto quando:** três experiências registradas e comparação revisada com limitações explícitas, sem dados privados no Git.
- **Dependências:** M3.00; cenário aprovado e execução do Fábio.

#### M3.25 Manual do dono

- **Fazer:**
  1. Inventariar serviços, titular, administradores, cobrança, região, domínio, finalidade e suporte oficial.
  2. Registrar custos confirmados/data/responsável, distinguindo plano fixo, consumo e opcionais; não inventar valores.
  3. Documentar login/recuperação, senha/2FA, manutenção, deploy/saúde, backup/restauração, incidentes, retenção e rotação.
  4. Indicar onde humanos autorizados encontram os itens no cofre só de pessoas, sem copiar credenciais/dados de cobrança.
  5. André percorre passos essenciais e informa lacunas; atualizar o manual a partir dessa conferência.
- **Pronto quando:** André encontra serviços, reconhece cobrança/suporte e percorre recuperação/saúde/backup com orientação conferida.
- **Dependências:** D14/D16; inventário real; M1.52; M3.19/22. Acesso preparado não comprova domínio humano da conta.

#### M3.26 Passagem das contas

- **Fazer:**
  1. Preparar checklist de passagem/responsáveis/manutenção posterior para aprovação do Fábio.
  2. Fábio/André transferem acesso por meio seguro/cofre de pessoas; o agente não recebe senha, QR, recuperação ou chave.
  3. André confirma por login titularidade/administração/recuperação/cobrança no Gmail, Supabase, Vercel, Resend, domínio e demais serviços usados.
  4. Registrar confirmação sanitizada por serviço e acordo de manutenção. Alterações de papel/recuperação/revogação requerem autorização própria.
- **Pronto quando:** André confirma domínio/acesso e recuperação próprios, com manutenção acordada e nenhuma credencial na evidência.
- **Dependências:** M3.25; D14/D16; aprovação do Fábio. Convite enviado/tela aberta não concluem passagem.

#### M3.27 Rotação após passagem

- **Fazer:**
  1. Inventariar chaves/consumidores, ordem, testes, janela e recuperação; distinguir API, webhook e assinatura/Auth.
  2. Fábio/André geram/guardam novas chaves no cofre de pessoas e atualizam consumidores/variáveis. Agente prepara roteiros sem manipular/revelar valores.
  3. Conferir saúde/login/Storage/webhook idempotente/notificações após cada serviço por testes autorizados; Auth/cobrança/envio reais têm aprovação própria.
  4. Revogar anteriores após validação e registrar somente IDs/revisões/horários. Não presumir reutilização de chave revogada na recuperação.
- **Pronto quando:** consumidores novos funcionam, antigas deixam de autorizar e André confirma procedimento; replay não repete cobrança/aviso.
- **Dependências:** M3.26; inventário de M3.25; plano e autorizações específicas.

#### M3.28 Destino do repositório

- **Fazer:**
  1. Preparar alternativas de manutenção na Harmony ou transferência ao cliente, com responsabilidades/custos/acessos/continuidade CI e Vercel.
  2. Registrar decisão da passagem de Fábio/André. D15 definiu desenvolvimento, não a futura passagem.
  3. Para transferência, apresentar destinatário exato/checklist antes da aprovação; somente repositório público ID `1414349093`, excluindo arquivo privado ID `1413659875`.
  4. Após operação autorizada, conferir dono/ID, acesso de André, proteção main, CI, integração Vercel/remoto e atualizar contas esperadas/instruções.
  5. Visibilidade, novos acessos e revogação da manutenção não mudam implicitamente pela transferência.
- **Pronto quando:** escolha registrada e, se transferido, destino/integrações conferidos; se mantido, propriedade e manutenção acordadas.
- **Dependências:** M3.25/26; decisão de passagem D15; autorização específica para transferência/acessos.

## Decisões do Fábio e do André

<!-- hub: ignorar -->

Os agentes trabalham com o padrão recomendado e deixam o item aberto até a confirmação. Ao decidir, marque `[x]` e escreva a escolha e a data.

- [x] **D1 Banco de dados:** Supabase Cloud em conta nova do cliente, projeto `qtofwbxujshroaafxowr` (decidido pelo Fábio em 2026-10-10). Recomendado: região São Paulo e plano Pro.
- [x] **D2 Hospedagem:** Vercel em conta nova do cliente (decidido pelo Fábio em 2026-10-10). Plano Pro, porque o Hobby não permite uso comercial; o Cloudflare foi avaliado e descartado.
- [ ] **D3 Marca, domínio e endereço provisório:** nome da nova empresa de perícia (formulário de marca). Até lá, a produção fica no endereço `.vercel.app`.
- [ ] **D4 Áreas no MVP:** só trabalhista (recomendado) ou já com cível e previdenciário.
- [ ] **D5 Caminho "Só o PDF" e reembolso:**
  - a taxa: R$ 150 a mais, como o André propôs, ou "triagem" que entrega o índice de páginas e é abatida do cálculo se o cliente fechar (recomendado pela pesquisa);
  - reembolso automático do sinal se o prazo estourar por culpa do prestador?
- [ ] **D6 Assinatura e liberação da entrega:**
  - parecer assinado com certificado ICP-Brasil (recomendado; a assinatura gov.br não vale para processo judicial);
  - o certificado do André é A1 ou A3?
  - a entrega é liberada antes ou depois do pagamento do saldo?
- [ ] **D7 WhatsApp:**
  - **recomendado:** API oficial do WhatsApp na conta Meta Business do cliente, com número dedicado. É do cliente e serve depois para os advogados.
  - **alternativa:** Z-API na conta do cliente, mais rápida de montar, mas não oficial.

  A Evolution API da VPS da Harmony não serve, porque não é do cliente.
- [ ] **D8 Retenção de documentos:** por quanto tempo guardar os PDFs depois da conclusão (sugestão: até o fim do processo, para reaproveitar nas atualizações, com exclusão a pedido).
- [ ] **D9 Cobrança e nota fiscal:** conta Asaas em qual CNPJ (nova empresa de perícia ou o atual do André) e como emitir nota.
- [ ] **D10 Prazos padrão:** entrega padrão de 3 dias úteis? Folga de 2 dias úteis antes do vencimento processual? Percentual de urgência?
- [ ] **D11 Pausa do prazo:** quando o pedido está "aguardando cliente", o prazo de entrega se estende pelo tempo de espera?
- [ ] **D12 Modelo de IA (M4):** `claude-opus-5-5` em todas as etapas (padrão) ou um modelo mais barato na triagem, depois de medir custo e acurácia.
- [ ] **D13 Acesso da administração aos documentos:** sem acesso por padrão (recomendado), com liberação pontual registrada.
- [ ] **D14 Cofres:**
  - o cofre `proj-andre-calculos`, que os agentes leem, fica só com chaves de desenvolvimento;
  - logins das contas do cliente e chaves de produção vão para um segundo cofre, `proj-andre-calculos-prod`, só de pessoas (recomendado).

  Até decidir, nenhuma credencial de conta ou de produção entra no cofre dos agentes.
- [x] **D15 Repositório:** organização Harmony-Digital no GitHub, `Harmony-Digital/andre-calculos` (criado privado pelo Fábio em 2026-10-10 e transferido para a organização no mesmo dia). Em 2026-10-11, Fábio autorizou mudar para público para usar CI gratuito e retirar a transcrição mantendo o original local. Novo repositório público independente ID `1414349093`, com histórico limpo, e arquivo anterior ID `1413659875` conservado privado; evidência em `docs/evidencias/git/retirada-transcricao.md`. Na passagem, decidir se vai para o cliente.
- [ ] **D16 Conta-mãe e cobrança:**
  - Gmail novo do cliente (decidido), com 2FA por app autenticador e recuperação no celular e e-mail do André;
  - planos pagos no cartão do cliente;
  - depois, trocar o login para o e-mail do domínio.
- [ ] **D17 Ambiente local:**
  - **recomendado:** OrbStack (leve no Mac) ou Docker Desktop, para rodar o Supabase local completo (banco, login e arquivos);
  - **sem Docker:** desenvolver contra um segundo projeto do Supabase na nuvem, que custa à parte no plano Pro.

  Enquanto isso, o agente adianta as tarefas sem banco.

## Registro de Execução

- **2026-10-12 - início M3.01u/w:** preflight aprovado e worktree limpo na fonte documental536b9c6. Branch feat/projecao-financeira. U desdobrada antes do código em w/x pela fronteira entre regra/projeção e efeitos/resolução; nenhuma exigência removida. CI27 vivo/fonte4559f4d preservada. Somente dados/banco locais; sem cloud, pagamento real ou publicação.

- **2026-10-12 - M3.01t preparada/verificada localmente:** fonte4559f4d/PR #27 e check/build remoto aprovado. 30 próprios/621 gerais de banco,1138 unitários/43 scripts, advisors sem achados e duas revisões sem bloqueador. Journal persiste antes da futura aplicação, fonte/prova imutáveis e estorno tardio consultável. Logs: banco e673d83a42237be15a22ee86455c3b47b433d30ba97c897880cb3a511d758259; read-back f8a362534fb68fd44b06624daf7e62eb7a522fe4653e6eec9b4e890ec7dd7e51. Build local conserva EPERM de porta no CSS; fonte equivalente passa no CI, sem contorno. CI geral vivo/fonte congelada; fechamento documental somente local. Nenhuma ação cloud/MCP/pagamento real/publicação. Próxima M3.01u; objetivo integral ativo.

- **2026-10-12 - CI completo de S:** fonte924a171/PR #26 preservada, CI38199725409 integralmente success:591 banco/31 arquivos,167 navegador/sete omissões e dois advisors sem achados. Checkoutb9cf72fc/pais main9a25+fonte conferidos, extrato9f879f1bdb5c362128fb64baf00adc60ea17d58fd26bd0a6c1e56af835969854. PR pronto para revisão, sem merge/publicação.

- **2026-10-12 — início M3.01t:** preflight GitHub/cofre aprovado; branch feat/observacoes-financeiras deriva do fechamento local 1e3657c. Escopo integral de t preservado; consultas financeiras usam identidade histórica independente da reserva, sem efeitos financeiros. Nenhum MCP/serviço real utilizado nesta etapa.

| Data | Quem | Entregue | Pendências |
|---|---|---|---|
| 2026-10-10 | Claude Code | Transcrição da reunião com separação de falantes; pesquisa de concorrentes (`docs/pesquisa/reports/`); `PRD.md`, `plan.md`, `AGENTS.md` e `CLAUDE.md` | Decisões D1 a D13; cadastro no Hub; tabela de preços do André; início do M1 |
| 2026-10-10 | Claude Code | Padrão de segredos no 1Password: um cofre por projeto e contas de serviço só de leitura (`AGENTS.md` §7.1, `PRD.md` §11.7, frente "Segredos" no M1, D14) | Fábio criar o cofre e a conta de serviço do agente |
| 2026-10-10 | Claude Code e Fábio (Touch ID) | `scripts/configurar-1password.sh`: conta de serviço `sa-andre-calculos-agente` criada com leitura só em `proj-andre-calculos` (o cofre já existia); token nas Chaves do macOS; teste confirmou acesso só ao cofre do projeto | Itens do cofre entram conforme cada serviço for configurado; D14 |
| 2026-10-10 | Claude Code | Stack decidida (Vercel e Supabase em contas do cliente; GitHub na organização Harmony-Digital); `.mcp.json` com MCPs próprios do projeto; `.claude/settings.json` bloqueando MCPs de outras contas e comandos que revelam segredos; preflight de contas no início de toda sessão; `.gitignore`; PRD §11, AGENTS §7 e M1 atualizados | Fábio aprovar e autenticar os MCPs; decidir o áudio no primeiro commit antes do push |
| 2026-10-10 | Claude Code | Repositório transferido da conta pessoal para a organização: `Harmony-Digital/andre-calculos` (privado, vazio); origin local atualizado; preflight OK | Primeiro push depende da decisão sobre o áudio no commit `1d4e8ea` |
| 2026-10-10 | Claude Code | Plano reescrito para execução por agentes: IDs em todas as tarefas, "Insumos pendentes", "Ordem de execução", especificação passo a passo de todas as tarefas do M1 e do M2, tarefa `.00` de detalhamento no M3 a M6, D17 (ambiente local). Contas do Supabase e da Vercel do cliente registradas como criadas. Constatado: Docker ausente; CLIs da Vercel e do Supabase logadas em outras contas | Insumos do Fábio e do André listados em "Insumos pendentes" |
| 2026-10-11 | Codex | Documentação organizada (M1.11), fundação Next/rotas/fontes locais/health (M1.30–32); checklist/schema/CNJ, motores puros de preço/prazo/complexidade/estados; rascunhos legais; npm run check e 165 testes unitários aprovados, 22 e2e/axe em 375/1440 px; Colima exclusivo e Supabase local saudáveis; CI preparado | Não publicado; áudio bloqueado por revisão automática; OAuth do MCP Supabase dedicado aguardando login; migrations, seed e autenticação a seguir. npm audit --omit=dev sem achados; cinco alertas altos transitivos em ferramentas ESLint (braces sem versão corrigida disponível), registrar e acompanhar sem downgrade de Next. shadcn configurado pelo método manual para preservar os tokens próprios. |
| 2026-10-11 | Codex | Seed fictício (M1.40), SSR/roles/login/logout (M1.41/43), quatro migrations locais com RLS, Storage privado, TUS assinado, hash no servidor e download auditado (M1.42/44 e M2.18/20 parciais); npm run check verde com 186 unitários, 37 e2e/axe aprovados e um ensaio de 300 MiB omitido só no celular; 16 testes RLS, advisors e SQL lint sem achados; npm audit --omit=dev sem achados; imagens em docs/evidencias/autenticacao-arquivos. CI preparado com Supabase local e nenhum segredo de produção (M1.24) | Nuvem intacta; OAuth Supabase dedicado e decisão sobre áudio continuam pendentes. Textos legais ainda não aprovados, cadastro público desabilitado. Especificações atualizadas: cookies HttpOnly e upload assinado por caminho sem JWT no navegador; Storage sem SELECT direto para exigir auditoria; limite 500 MB; dev-env mantém chaves só em memória conforme AGENTS §7.1. Template 1Password e lista de variáveis preparados, ensaio com cofre ainda pendente. |
| 2026-10-11 | Codex | Cadastro/aceites versionados testados no Mailpit com fixture local (M2.04 parcial); perfil, senha, revogação em outro dispositivo e exclusão idempotente auditados (M2.06); aviso new_signup enfileirado sem CPF/CNPJ (M2.05); questionários de marca/preços preparados (M2.01/07 parciais). npm run check verde, 213 unitários, 17 RLS e 41 e2e aprovados, três ensaios únicos omitidos só no celular; advisors/lint SQL locais sem achados; imagens em docs/evidencias/cadastro-conta | Nuvem e publicação pendentes; rascunhos legais não liberam cadastro em produção. Fixture fixture-termos-v1/fixture-privacidade-v1 válida só com NODE_ENV não production, ANDRE_LOCAL_TESTS e URL local exata; settings restauradas no finally. Auth local passou a exigir confirmação e senha de 12 caracteres; limites ampliados servem apenas aos ensaios locais. CNPJ alfanumérico conforme manual da Receita Federal, vigente desde julho/2026. Próximo: persistência do checklist. |
| 2026-10-11 | Codex | Checklist salvo e retomado por etapa, revisão otimista, auditoria e linha do tempo (M2.08 parcial); pedidos continuam draft/zero e cliente B recebe 404; migrations locais 0008/0009, SQL lint/advisors sem achados; npm run check com 220 unitários, 19 RLS e 41 e2e aprovados, três ensaios únicos omitidos só no celular; imagens em docs/evidencias/checklist | Validação dos campos pelo André, preços e nuvem pendentes. Migration 0009 corrige qualificação de variável da RPC, descoberta pelo teste real; seed tem respostas fictícias válidas; normalização de CNPJ rejeita Unicode que se converteria em ASCII. Próximo: M2.33. |
| 2026-10-11 | Codex | Painel de configurações (M2.33 parcial), versões de preços e itens imutáveis, ativação concorrente e revisão de settings protegidas; dados profissionais/garantia aparecem no site, Pix não é público; limites do classificador carregados de settings (M2.11). Migrations locais 0010/0011, lint/advisors sem achados; npm run check com 232 unitários, 24 RLS e 44 e2e aprovados; quatro ensaios únicos omitidos só no celular; imagens em docs/evidencias/configuracoes | Nenhuma tabela fictícia ficou ativa e settings legais/profissionais foram restauradas no fim dos testes. Formulário volta a modo exemplo após salvar e exige confirmação a cada ativação. Nuvem, insumos do André, aprovação dos textos, snapshot da proposta e gates pendentes. |
| 2026-10-11 | Codex | Pasta com seis abas e quatro pastas fixas (M2.20), PDF privado sob demanda, senha efêmera, zoom/páginas/texto e rolagem por teclado; proxy autenticado HEAD/Range/206 auditado em migration local 0012; hash incremental do upload em blocos de 4 MiB (M2.18). SQL lint/advisors sem achados; npm run check com 245 unitários, 28 RLS e 49 e2e aprovados; cinco ensaios únicos omitidos só no celular; npm audit --omit=dev sem achados; imagens em docs/evidencias/pasta-processo | PDFs inteiramente fictícios com duas páginas, URI externa e OpenAction não causaram navegação/requisição/diálogo externo; senha fictícia não apareceu em requisições, console ou armazenamento do navegador. Upload de 300 MiB retomou dos 12 MiB e confirmou hash. Teste local do stream acima de 4,5 MB não substitui ensaio hospedado de 500 MB. Mensagens/decisões/índice ainda só exibem dados; seus formulários, notificações e exportação seguem em M2.22–24. Nuvem, insumos e gates continuam pendentes. |
| 2026-10-11 | Codex | Conversa privada e anexos da pasta do cliente (M2.22 parcial), formulário preservado após erro, retry sem duplicação, projeção de participantes e histórico paginado com microssegundos; mensagem/auditoria/evento/avisos atômicos e vínculos imutáveis dos anexos nas migrations locais 0013–0015. npm run check com 253 unitários/build, 37 RLS e 55 e2e aprovados; cinco ensaios únicos omitidos só no celular; SQL lint/advisors sem achados; imagens em docs/evidencias/mensagens | Avisos new_message enfileirados por canal conforme preferências, sem corpo/anexos no payload; despacho depende de M2.28/29. Resposta perdida após commit recuperou uma mensagem e uma auditoria. 112 mensagens com empates exatos e no mesmo milissegundo foram recuperadas sem perdas. Dados profissionais/legais restaurados, zero preços ativos e zero processos temporários de mensagens. Nuvem, áudio, insumos e gates continuam pendentes. |
| 2026-10-11 | Codex | Linha do tempo filtrada/paginada e notas do calculista compartilhadas com o cliente (M2.21 parcial); helper SQL transacional usado por rascunho/upload/mensagem, sem EXECUTE dos papéis da aplicação; conteúdo de eventos imutável, notas idempotentes/auditadas, índices nas migrations locais 0016–0017. npm run check com 255 unitários/build, 43 RLS e 59 e2e aprovados; cinco ensaios únicos omitidos só no celular; SQL lint/advisors sem achados; capturas em docs/evidencias/linha-do-tempo | Ensaio recuperou 112 notas depois de 105 uploads, com empates de microssegundos, filtro antes do limite e reinício da paginação ao trocar tipo. Sem avisos externos por notas. Settings profissionais/legais restauradas, zero preços ativos e zero processos temporários; papel calculista confirmado. Ajustados somente fins de arquivo das migrations 0014/0015. Eventos comerciais/decisões/entrega entram com seus casos de uso; nuvem, áudio, insumos e gates seguem pendentes. |
| 2026-10-11 | Codex | Registro imutável de decisões, premissa RN-08, concordância exclusiva do cliente e PDF privado (M2.23); RPCs com autoria inferida, idempotência, evento/auditoria atômicos nas migrations locais 0018–0019. npm run check com 259 unitários/build, 49 RLS e 63 e2e aprovados; cinco ensaios únicos omitidos só no celular; lint/advisors sem achados; capturas/PDFs fictícios em docs/evidencias/decisoes | Todas as seis páginas do ensaio longo e o PDF de uma página conferidos visualmente; 12 registros completos, mil caracteres sem perda, margens/rodapés/fontes locais verificados. lineHeight herdado provocava rodapé vazio e foi removido após reprodução isolada; página SQL opcional recebe default NULL. Settings/fixtures restauradas, zero preços ativos/processos temporários. Dados reais/CRC são insumos de publicação; nuvem, áudio e gates seguem pendentes. Próximo: M2.24. |
| 2026-10-11 | Codex | Índice por arquivo/versão com CRUD do calculista, cliente somente leitura, revisão concorrente e recibos privados imutáveis (M2.24); eventos/auditoria atômicos e paginação de cinquenta. Migrations locais 0020–0022, SQL lint/advisors sem achados; npm run check com 263 unitários/build, 55 RLS e 67 e2e aprovados; cinco ensaios únicos omitidos só no celular; capturas em docs/evidencias/indice | 61 referências com empates recuperadas; duas sessões não sobrescrevem revisão antiga; replays funcionam após remover entrada/arquivo; versão nova sem herança. Corrigidos escopo SQL e uso de PT409 para evitar retries, além de useId nos rótulos após criação. Dois processos de ensaios interrompidos limpos; zero processos temporários/recibos. Formato das páginas validado, sem alegar contagem real do PDF. Nuvem, áudio, insumos e gates seguem pendentes. Próximo: M2.25. |
| 2026-10-11 | Codex | Fila do André (M2.25), ordenação pelo prazo/UUID com nulos ao final, filtro antes do limite e situação de pagamentos confirmados; destaque por data civil de São Paulo/calendário provisório. Migration local 0023 com índices parciais; lint/advisors sem achados; npm run check com 267 unitários/build, 55 RLS e 71 e2e aprovados; cinco ensaios únicos omitidos só no celular. Capturas em docs/evidencias/fila | 116 pedidos fictícios recuperados sem perdas, 61 na revisão filtrada, inclusive cursor de prazo nulo; dados temporários removidos e settings/preços restaurados. Contraste dos rótulos corrigido e capturas conferidas. Nenhuma alteração de permissões. Calendário real do TRT, nuvem, áudio, insumos e gates seguem pendentes. Próximo: M2.26. |
| 2026-10-11 | Codex | Entrega conferida (M2.26): PDF/PJC/parecer e DOCX/XLSX, checklist explícito, snapshots profissionais/arquivos imutáveis, confirmação transacional/idempotente, evento/auditoria/aviso enfileirado. Migrations locais 0024–0026; lint/advisors sem achados; npm run check com 269 unitários/build, 61 RLS e 75 e2e aprovados; cinco ensaios únicos omitidos só no celular; capturas em docs/evidencias/entrega | Dois pedidos disputando arquivos tiveram um vencedor sem deadlock; falhas não deixaram efeitos parciais. Política pendente bloqueia cliente, saldo confirmado libera, estorno bloqueia nova leitura; URL de 120 s e auditoria verificadas. Corrigida visibilidade de metadados pendentes do calculista para TUS e exibição do mês/estilos. Dados profissionais/legais/preços restaurados e zero processos/entregas temporários. D6, despacho real, nuvem, áudio e gates seguem pendentes. Próximo: completar M2.27 local. |
| 2026-10-11 | Codex | Paginação de entregas no resumo (M2.26a), cinquenta por página com cursor data/UUID sem conversão por Date e retorno às recentes. npm run check com 269 unitários/build; dois e2e novos em 375/1440 px e quatro fluxos de entrega repetidos aprovados | Todos os 61 registros fictícios com empates exatos/diferença de um microssegundo recuperados por cliente e painel; cursor inválido recebe 404, página vazia volta ao início, axe/largura passaram. Sem migration nem alteração de permissões. Evidência: docs/evidencias/entrega/README.md. Próximo: M2.27. |
| 2026-10-11 | Codex | Aprovação explícita da regra futura/individual de liberação e instruções Pix/saldo por pedido (M2.27 local); recibos imutáveis, revisão concorrente, evento/auditoria e deduplicação financeira. Migrations locais 0027–0028, lint/advisors sem achados; npm run check com 270 unitários/build, 64 RLS e 77 e2e aprovados; cinco ensaios únicos omitidos só no celular. Capturas em docs/evidencias/liberacao | Suíte completa reproduziu perda de seleção antes do carregamento do formulário; campos agora só habilitam depois, seis ensaios específicos e suíte completa repetidos aprovados. Pagamento parcial, estorno, Pix ausente, políticas mistas e paginação conferidos. Configurações restauradas e zero processos/entregas/aprovações temporários; D6 real, nuvem, áudio, insumos e gates seguem pendentes. Próximo: M2.32. |
| 2026-10-11 | Codex | Visão geral e listas do painel (M2.32), contagens exatas antes do limite, cadastros de clientes em sete dias, propostas válidas sem aceite, pagamentos/fila/prazos e cinco próximos trabalhos. npm run check com 271 unitários/build; dez regressões específicas, 79 e2e da suíte completa e dois ensaios finais de layout aprovados; cinco ensaios únicos omitidos só no celular. Capturas em docs/evidencias/painel | 116 atrasados e 61 propostas paginados sem perdas em 375/1440 px; axe, filtros e papéis conferidos. Corrigida entrada do admin para preservar login/logout sem ler indicadores operacionais; ensaio interrompido deixou somente fixture profissional, limpa com marcador exato. Configurações restauradas, quatro perfis fictícios e zero processos/entregas/aprovações temporários; sem migration, push ou escrita na nuvem. Próximo: preparar M2.12 local com guardas para insumos comerciais e prazo. |
| 2026-10-11 | Codex | Preferências por evento/canal (M2.31): vínculo persistente do responsável, revisão concorrente, recibos imutáveis e auditoria; migration local 0029, lint/advisors sem achados. npm run check com 273 unitários/build, 71 RLS e 81 e2e da suíte completa aprovados; dois ensaios finais em 375/1440 px confirmaram reenvio após resposta perdida e revalidação de outro formulário. Capturas em docs/evidencias/notificacoes | Canal desligado não cria novo aviso; pendentes preservados e ocorrências antigas não recuperadas. Outro calculista não controla as preferências do responsável. Ajustada espera limitada do lock das fixtures para 60 s e execução de cadastro/settings para 90 s; interceptação de rede agora termina antes da limpeza. Um processo, três recibos e duas preferências fictícias de ensaio interrompido foram identificados e removidos; read-back final sem resíduos, contatos e configurações reais vazios. M2.31 pôde ser verificada localmente antes dos provedores; ordem do plano ajustada por essa independência. Registradas a disponibilidade necessária para RF-22 e a distinção entre horários pontuais e janela de envio. Nuvem, áudio, insumos e GATEs continuam pendentes. Próximo: preparar M2.30 local sem ativar cron ou envio real. |

| 2026-10-11 | Codex | Preparação local dos lembretes (M2.30): seleção por dias úteis/atraso, janela independente, recibos privados, cancelamento de pendentes obsoletos e cron Bearer sem parâmetros de relógio. Migrations locais 0030/0031; lint SQL e catálogo de RLS/permissões/índices sem achados. npm run check com 300 unitários/build, 82 RLS e 82 e2e aprovados; seis ensaios únicos omitidos só no celular. Capturas em docs/evidencias/lembretes | Runner percorreu 205 pedidos fictícios no banco local e replay consumiu zero; concorrência gerou no máximo um aviso, prazo A→B→A não reabriu recibo, canais OFF não receberam. Vínculo/papel protegidos por lock entre conferência e enqueue. Read-back: 31 migrations, cinco tabelas internas com RLS, quatro perfis/um processo fictício, zero recibos/avisos/auditorias de lembrete e contatos/CRC/preços reais vazios; janela restaurada em 07h/21h. Calendário TRT, cron/provedores reais, nuvem, áudio e GATEs seguem pendentes. Nenhum envio real, push ou escrita externa. Próximo: M2.12 local com guardas comerciais e disponibilidade. |

| 2026-10-11 | Codex | Preparação de proposta/PDF local (M2.12): avaliador puro com insumos explícitos, numeração anual transacional, snapshot imutável, replay após perda de resposta/configuração alterada, evento/auditoria atômicos e PDF privado. Migrations locais 0032–0034, SQL lint e catálogo de RLS/permissões/índices conferidos. npm run check com 332 unitários/build, 88 RLS e 87 e2e da suíte final aprovados; sete ensaios únicos omitidos no celular. Capturas e PDF fictício em docs/evidencias/propostas | Seis serviços, condições com quatro mil caracteres e token de 460 caracteres preservados em três páginas; todas renderizadas/inspecionadas, CRC/rodapés/limites confirmados. Corrigidos CHECK com NULL, probe sem escrita, settings obrigatórias e multiplicação de lineHeight na repetição de páginas. Servidor reiniciado confirmou CSS atual em 375/1440 px. Read-back: 34 migrations, sete tabelas privadas com RLS, quatro perfis/um processo/um rascunho e proposta TESTE-1 histórica do seed, zero simulações/recibos/preços ativos, dados reais vazios; contador anual preserva histórico dos ensaios. Comercial depende de calendário, disponibilidade/reserva, regra de meses e dados reais; aceite/recusa seguem M2.15. Sem push/envio/nuvem; advisors da nuvem aguardam conexão dedicada. Próximo: M2.14 local. |

| 2026-10-11 | Codex | Aviso de orçamento (M2.14) transacional por trigger privado; guardas de simulação, payload mínimo, dedup por UUID/canal e locks de responsável/configurações. Migration local 0035, SQL lint e catálogo de RLS/search_path/permissões conferidos. npm run check com 332 unitários/build, 96 RLS da suíte final e oito regressões de navegador em 375/1440 px aprovados | Positivo usa somente proposta legada sintética, sem liberar snapshot comercial. Dois clientes/calculista/admin/anônimo não forjam proposta/aviso; preferência concorrente observada por lock PostgreSQL, falha no segundo canal reverte ambos, replay/UPDATE não duplicam e simulações reais do checklist produzem zero avisos. Ajustado ensaio para disputa também pela chave única de número e timeout de limpeza; read-back: quatro perfis/um processo/um pedido/TESTE-1 histórica, zero simulações/recibos/avisos/funções/sessões temporários, preços ativos zero e dados reais vazios. Evidência: docs/evidencias/propostas/avisos.md. Sem envio, push ou escrita na nuvem; advisors da nuvem aguardam conexão dedicada. Próximo: M2.15 local com guardas comerciais/legais. |

| 2026-10-11 | Codex | Aceite eletrônico preparado localmente (M2.15): proposta/termos integrais protegidos, versões/hashes, recibo imutável com origem HTTP, UUID estável, replay e efeitos transacionais. Migrations locais 0036–0040; contrato sem documento aguarda envio e confirmação do primeiro upload libera fila, recuperando resposta perdida. npm run check com 337 unitários/build, 114 RLS e 97 e2e da suíte completa aprovados; treze regressões finais de aceite/painel/configurações aprovadas em 375/1440 px. Capturas inspecionadas em docs/evidencias/propostas/aceite.md | Concorrência gera um recibo; vencimento durante lock não contrata; falha no último aviso reverte aceite/upload/fila. Contextos positivos são preparados só por PostgreSQL local com conteúdo sintético, preservando guardas 0033/0034 e bloqueio comercial. Corrigido reset tardio dos preços: erros preservam escolha/valores/confirmação e sucesso exige nova aprovação desmarcada; painel mostra bloqueios e links próprios. Build novo e cadeia check concluídos após remover cache gerado pelo ensaio restrito. Read-back: 40 migrations, 25 tabelas públicas/dez internas com RLS, quatro perfis/um processo/um pedido/TESTE-1 do seed; zero contextos/aceites/intenções/simulações/funções/sessões temporários e preços ativos. Preservados 56 arquivos sintéticos dos ensaios gerais e um aviso antigo new_signup pending, sem tentativas; nenhum aviso do aceite restante e dados profissionais reais vazios. Sem push, contratação/envio ou escrita na nuvem; advisors da nuvem aguardam conexão dedicada. M2.15 continua parcial até produtor comercial/textos aprovados. Próximo: M2.16 local. |

| 2026-10-11 | Codex | Pagamento manual do sinal preparado localmente (M2.16): instruções privadas, confirmação exclusiva do calculista com valor derivado do aceite e parcelas anteriores, recibos/UUIDs imutáveis e proteção do lançamento financeiro. Migrations 0041/0042, integração do primeiro documento posterior, contrato vigente e aviso de fila com data de entrega. npm run check com 337 unitários/build, 127 testes de banco e quatorze e2e de sinal/aceite em 375/1440 px aprovados; seis capturas inspecionadas | Corridas entre confirmação/upload e promoção pending observada por lock PostgreSQL, replay após resposta perdida/cancelamento/estorno, saldo ímpar e rollback do aviso conferidos. Corrigida guarda para não presumir contrato vigente pelo recibo histórico; cartão renova a intenção após mudança de saldo/estorno. SQL lint sem erros; RLS em 25 tabelas públicas/doze privadas, search_path seguro e novas FKs indexadas. Read-back: 42 migrations, quatro perfis/um processo/um pedido/TESTE-1; zero contextos/aceites/intenções/recibos/simulações/funções/sessões temporários e preços ativos. Preservados 56 arquivos sintéticos antigos, depósito pending P-TESTE-0001 do seed e um aviso antigo de cadastro; dados reais vazios. Evidência: docs/evidencias/pagamento-manual/README.md. Sem push, cobrança, mensagem ou escrita na nuvem; advisors da nuvem aguardam conexão dedicada. M2.16 continua parcial até ativação comercial. Próximo: M2.17 local. |

| 2026-10-11 | Codex | Cadastro de cliente com contrato concluído localmente (M2.17): painel com motivo/revisão/histórico privado, RPC exclusiva do calculista, condição atual integrada ao aceite/documento e proteção contra escrita direta das colunas comerciais. Migrations 0043–0045, npm run check com 340 unitários/build, 142 testes de banco e 22 e2e de contrato/sinal/aceite/painel aprovados em 375/1440 px; seis casos de contrato repetidos após ajuste final, quatro capturas inspecionadas | Quinze casos próprios de banco: replay após decisão posterior, duas intenções concorrentes, rollback de vários pedidos, upload/sinal e locks PostgreSQL de perfil/parcela. Motivo não circula ao cliente, histórico financeiro/aceite preservados e retirada bloqueada em trabalho ativo. Protegido vínculo de todo pagamento para impedir transferência concorrente/deadlock; mensagem de sucesso oculta ao começar nova edição. Lint SQL sem erros; read-back: 45 migrations, 25 tabelas públicas/treze privadas com RLS, search_path seguro, FKs indexadas e grants por coluna conferidos. Zero amostras de contrato/aceite/sinal/contexto/simulação/revisão/preços/funções/sessões restantes; preservados seed e 56 arquivos sintéticos antigos. Evidência: docs/evidencias/clientes-com-contrato/README.md. Sem push, cobrança, envio ou escrita na nuvem; advisors externos aguardam conexão dedicada. Próximo: M2.34 local; publicação, CI real e insumos comerciais continuam pendentes. |
| 2026-10-11 | Codex | M2.34 preparado e verificado localmente: jornada única do cadastro ao download, duas sessões, dez páginas com axe por largura; 109 e2e da suíte completa aprovados, sete omitidos apenas no celular, dois casos da jornada repetidos após ajuste visual, 142 testes de banco e npm run check (340 unitários/build) verdes. CI separado, máscaras de credenciais locais e captura PNG restrita preparados | Evidência: docs/evidencias/jornada-local/README.md. Três pontes sintéticas explícitas não habilitam comércio. Correção M2.34a: ações finais do checklist empilham no celular e teste verifica limites do painel. Advisors locais de segurança/desempenho sem achados. Read-back preserva seed e 58 arquivos anteriores; zero registros novos da jornada ou configurações reais. Fábio confirmou OAuth Supabase e autorizou retirar áudio do histórico mantendo original; ferramentas dedicadas ainda ausentes e atualização pela interface recusada por Computer Use. Preflight remoto: fabioalmeidadigital, repositório privado correto, sem referências remotas. M1.10 e primeiro push serão executados; CI remoto continua pendente. |
| 2026-10-11 | Codex | M1.10 concluído após autorização explícita: filtro do caminho exato do áudio em 24 commits e duas árvores de snapshot Git, com comparação integral dos demais arquivos e metadados; referências trocadas atomicamente sem maintenance/GC e original local preservado | Read-back independente: índice/log/referências de backup vazios para o áudio, blob ausente de todos os objetos alcançáveis, ignore válido e SHA-256/tamanho idênticos. Evidência: docs/evidencias/git/retirada-audio.md e mapa dos SHAs. Commit M2.34 filtrado: 91f4c0ff608a3db76098f61bca5d56783bad81b9. Sem force-push; remoto ainda vazio antes da operação. Próximo: M1.12 e CI real. |
| 2026-10-11 | Codex | M1.12 concluído: main recebeu fast-forward e primeiro push autenticado como fabioalmeidadigital; API e clone bare independente confirmaram cc34885848e694887e7da7be626e87d2e037118a, 25 commits e ausência do áudio. Varredura pré-push: 682 blobs, zero candidatos nos padrões de credenciais examinados | CI 38139370081: jobs qualidade/e2e recusados antes de etapas por cobrança/limite; não é teste reprovado nem CI verde. Consulta e criação de ruleset recusadas por exigir upgrade no privado. Payload .github/main-ruleset.json preparado; runner fixado em Ubuntu 24.04 após aviso de migração de ubuntu-latest em 2026-10-19. Fábio pediu visibilidade pública para eliminar custo dos runners; transcrição integral de 403 linhas encontrada no histórico, decisão sobre publicação/preservação local solicitada. Nenhuma mudança de cobrança ou privacidade executada. Evidência: docs/evidencias/git/primeiro-push.md. |

| 2026-10-11 | Codex | Preparação de M1.23: wrapper exclusivo do Fábio com op run, referências por ambiente, conta pessoal e destino declarado; CLI recebe somente token/IDs e valor atual por stdin, sem arquivo com segredo, sobrescrita ou deploy | Doze testes fictícios aprovados; revisão independente corrigiu NEXT_PUBLIC como Config porque a CLI recusa esse prefixo para Secret. Supabase/service role e origens separados por ambiente; cadastro parcial reporta nomes e não presume valores existentes. Conferência local recusou metadados ainda ausentes sem abrir o 1Password ou conectar à Vercel. Format/lint/types/340 unitários e doze testes de scripts aprovados; build Turbopack recusado pelo ambiente ao abrir porta interna, inclusive na execução escalada, sem alteração de código do compilador. Fábio autorizou a retirada integral da transcrição preservando o original; M1.10a e validação remota iniciados. |

| 2026-10-11 | Codex | M1.10a verificado: filtro dos dois caminhos privados em 27 commits/todas as referências locais, original íntegro e demais arquivos/metadados preservados. Main privada saneada por lease, mas cache antigo ainda consultável; repositório antigo renomeado/arquivado privado e novo independente ID 1414349093 criado no mesmo endereço, conforme publicação autorizada. Clone remoto limpo e consultas anônimas dos conteúdos antigos HTTP 404. Ruleset 24880297 aplicado/read-back na main | Evidência: docs/evidencias/git/retirada-transcricao.md e mapa dos SHAs. Nenhum repositório excluído, nenhuma mensagem enviada; cache antigo permanece privado, sem purga física no GitHub. CI real por PR ainda pendente; última cadeia local aprovou formato/lint/types/340 unitários/doze testes de scripts, build bloqueado pelo ambiente. Nuvem dedicada, insumos e gates permanecem pendentes. |

| 2026-10-11 | Codex | M1.13 e M2.34 concluídos no CI remoto 38142154491/SHA b7d4390ca522d3d127062f796acf5a9be5966787: qualidade e e2e success; 340 unitários/33 arquivos, doze testes de scripts, build, 142 testes de banco/16 arquivos, 109 e2e/7 omissões exclusivas do celular, advisors locais sem achados. PR #1 integrado normalmente em f0f900740ed60cb5cd655ce414b8b342ea35b0d9; fetch e comparação da árvore integral confirmaram código idêntico ao verificado | Evidência: docs/evidencias/git/ci.md. Corrigido critério M1.13 para nomes reais dos checks e especificação adicionada de M1.10a. As mudanças posteriores deste registro são só documentação; sem nova aplicação, envio, pagamento ou publicação do portal. Próximo M2.35 bloqueado pela skill security-review ausente; ferramentas dos MCPs dedicados, integração Vercel, planos/cofres, dados e decisões humanas continuam pendentes. Nenhuma outra tarefa de M1/M2 elegível sem esses insumos; M3 exige detalhamento/aprovação antes de execução. |

| 2026-10-11 | Codex | M1.03 verificado por OAuth/descoberta no cliente oficial Codex CLI 0.159.0/App Server efêmero: vinte ferramentas Supabase e 238 Vercel. M1.04 parcial: get_project_url retornou https://qtofwbxujshroaafxowr.supabase.co, list_teams zero equipes e get_team do ID esperado HTTP 403; conta/equipe/ID conferidos no navegador e valores esperados registrados | Evidência: docs/evidencias/mcp/validacao-2026-10-11.md. Preflight GitHub/remote/cofre exclusivo aprovado. Fábio autorizou 35 permissões somente para Projeto Andre; login concluído não resolveu acesso. Revogação recusada/cancelada sem execução; consentimento seguinte travado por resolução local vercel.com, limpeza de cache DNS solicitada. Sem MCP de outro cliente, CLI/API alternativa, projetos consultados, banco/deploy/env/billing ou publicação do produto. git diff --check e bash -n aprovados; app/scripts/workflow/migrations idênticos ao SHA b7d4390ca522d3d127062f796acf5a9be5966787 já aprovado no CI, sem novo npm run check nesta alteração documental. |

| 2026-10-11 | Codex | M1.04 concluído após consentimento final autorizado somente para Projeto Andre, mantendo acesso a todos os projetos atuais/futuros desmarcado. Chamadas nativas confirmaram get_project_url esperado, list_teams com só Projeto Andre/projeto-andre1/team_4fdLDCsB0ROvP5ph50aFNvxm, get_team correto e list_projects dessa equipe vazio; preflight GitHub/remote/cofre aprovado | Evidência: docs/evidencias/mcp/validacao-2026-10-11.md e capturas apresentadas no chat. Limpeza de cache DNS autorizada, mas sudo -n exigiu senha e nenhum flush/HUP ocorreu; endpoint OAuth voltou a responder 200 sem intervenção. Revisão automática da confirmação de projetos resolvida após comprovar checkbox desmarcado, sem ampliar esse escopo; login terminou com código zero. Nenhuma revogação, alteração de rede, criação de projeto, migration, deploy, variável, cobrança ou envio. Ferramentas dedicadas agora disponíveis no chat. git diff --check e bash -n aprovados; código do produto idêntico ao aprovado no CI, sem repetir npm run check para documentos/metadados. M1.05 e demais insumos humanos permanecem pendentes. |

| 2026-10-11 | Codex | Fábio autorizou domínio original Vercel e identidade/preços/calendário fictícios. M2.34b/M2.34c: demonstração isolada /demonstracao com Marco, advogado/calculista, checklist de nove etapas, proposta, aceite/sinal/documento simulados e timeline; oito testes de regras e quatro e2e em 375/1440 px aprovados, axe sem violações, zero chamadas externas | Evidência: docs/evidencias/demonstracao/README.md. Format/lint/tipos/348 unitários/doze scripts aprovados; build Turbopack local recusado por porta interna do ambiente, CI pendente. Preflight GitHub/cofre/destinos aprovado; MCP create_project na equipe correta respondeu403, nenhum projeto criado. Publicação M2.34d e demonstração hospedada ainda pendentes. Decisões comerciais/GATEs preservados. |

| 2026-10-11 | Codex | M2.34c concluído no CI 38153083358/SHA abe2fb4: 348 unitários, doze scripts, build, 142 RLS, 113 e2e/sete omissões e advisors sem achados. PR #2 integrado normalmente na main em 9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd; pacote ZIP de 158 arquivos comparado byte a byte com a main, sem segredos/áudio/transcrição. Projeto Vercel andre-calculos criado na equipe Projeto Andre pelo painel, Next.js/Node22/raiz vazia salvos | Evidência: docs/evidencias/demonstracao/README.md e pacote-manifesto.json. MCP create_project respondeu403 e list_projects continuou vazio; não houve ampliação de acesso. M2.34d parcial: upload automatizado recusado por permissão de arquivos locais, depois Computer Use recusou vercel.com por permissão negada pelo usuário. Nenhuma alternativa tentada após essa proteção; publicação e jornada pública aguardam nova autorização. Demonstração local disponível em 127.0.0.1:3000/demonstracao; domínio próprio/dados reais/GATEs preservados. |

| 2026-10-11 | Codex | Retomada M2.34d com nova autorização explícita do Fábio: "Autorizar acesso e publicação somente nesse projeto". Preflight GitHub/cofre/remoto aprovado. Leitura normal da mesma aba Vercel recusada por preferência salva que bloqueia vercel.com; nenhum caminho alternativo de acesso/publicação tentado. Auditoria independente repetiu bytes/tamanhos/hashes dos 158 arquivos do ZIP contra main9a25f31 e manifesto, sem divergências nem conteúdo privado reconhecido | Evidência: docs/evidencias/demonstracao/README.md. Nome/ID do projeto registrados em scripts/contas-esperadas.env (configuração local ignorada pelo Git) e AGENTS.md §7. Fábio orientado pela documentação oficial a remover somente vercel.com da lista de bloqueados e habilitar envio de arquivos pela extensão, com opção de envio manual do ZIP. git diff --check e bash -n aprovados; aplicativo idêntico à main testada, npm run check previamente verde no CI38153083358. Publicação e jornada pública continuam pendentes, sem concluir M2.34d. |

| 2026-10-11 | Codex | Fábio informou os dois ajustes de permissão concluídos. Preflight GitHub/cofre/remoto aprovado; leitura normal da mesma aba Vercel continuou recusada por preferência salva. Inspeção somente de leitura das configurações do Codex recusada por política do próprio app. Não houve acesso alternativo à Vercel. Preparada cópia permanente do ZIP em .data/publicacao/andre-calculos-demo.zip, ignorada pelo Git e conferida com SHA-256 85d678b463ef38fe5d3e3ddfd36fe4fdf2cebf49c82cc85b9b808d56ba7a8859 | Evidência: docs/evidencias/demonstracao/README.md, com roteiro de envio manual pelo Fábio no projeto existente. Auditor independente conferiu novamente os 158 arquivos contra main9a25f31, sem divergências. Aplicativo inalterado, npm run check já aprovado no CI38153083358; git diff --check aprovado. M2.34d permanece parcial: envio e jornada pública ainda não verificados. |

| 2026-10-11 | Codex | Fábio deixou a tela aberta e reiterou que o agente deve executar a publicação. Preflight GitHub/cofre/remoto aprovado; leitura normal da mesma aba Vercel novamente recusada por preferência salva de bloqueio de vercel.com. Não houve upload nem tentativa por outra superfície após a recusa | M2.34d parcial; pacote conferido/autorização preservados, publicação e jornada pública pendentes. Apenas registro no plano alterado; aplicativo idêntico à main aprovada no CI38153083358, sem repetir npm run check. git diff --check aprovado. |

| 2026-10-11 | Codex | Fábio sugeriu navegador incorreto. Inventário atual mostrou um Chrome conectado à ferramenta e duas abas no endereço Projeto Andre/andre-calculos. Selecionada a aba mais recente indicada pelo inventário, no mesmo Chrome; a proteção recusou a leitura por preferência salva que bloqueia vercel.com. Nenhum acesso por outra superfície após essa recusa | M2.34d permanece parcial, sem upload/publicação. Preflight GitHub/cofre/remoto e git diff --check aprovados; aplicativo inalterado, npm run check já verde no CI38153083358. O inventário não confirma que outros perfis sem extensão estejam conectados. |

| 2026-10-11 | Codex | Fábio informou o sistema reiniciado. Runtime CUA inicializado novamente; inventário identificou o mesmo Chrome pela instância da extensão e a aba Projeto Andre/andre-calculos. A proteção voltou a recusar acesso por preferência salva que bloqueia vercel.com. Nenhum upload ou acesso alternativo após a recusa | M2.34d parcial; reinício não resolveu. Preflight GitHub/cofre/remoto e git diff --check aprovados; aplicativo inalterado, npm run check já verde no CI38153083358. Pacote permanente .data/publicacao/andre-calculos-demo.zip pronto; publicação e jornada pública pendentes. Próximo passo de diagnóstico humano: /feedback ao suporte, conforme troubleshooting oficial, ou envio manual no projeto existente. |

| 2026-10-11 | Codex | Fábio informou atualização e ativação do uso no computador, antes desativado. Novo teste normal da aba Vercel recusado por preferência salva que bloqueia vercel.com; nenhum upload/acesso alternativo após a recusa. Solicitada somente confirmação diagnóstica da presença do domínio na lista de sites bloqueados | M2.34d parcial; pacote/autorização preservados. Preflight GitHub/cofre/remoto e git diff --check aprovados. Aplicativo inalterado, npm run check já verde no CI38153083358; publicação/jornada pública pendentes. |

| 2026-10-11 | Codex | Fábio questionou por que MCP Vercel conectado não dá acesso. Diagnóstico somente leitura no dedicado andre-calculos-vercel: list_teams confirmou apenas Projeto Andre/team_4fdLDCsB0ROvP5ph50aFNvxm; list_projects dessa equipe vazio; get_project com ID prj_tdmzmC6utVU2fHPz0iVhroMD8NtI/equipe correta respondeu 404 Project not found. Não testado outro MCP, CLI ou navegador; nenhuma publicação ou concessão | Evidência: docs/evidencias/mcp/validacao-2026-10-11.md. Autenticação confirmada, acesso ao recurso não confirmado. Ausência da autorização ao projeto criado depois é hipótese compatível, não causa comprovada. Nome da conexão vista pelo Fábio solicitado. Preflight e git diff --check aprovados; aplicativo inalterado, npm run check já verde no CI38153083358. M1.04a/M2.34d permanecem pendentes. |

| 2026-10-11 | Codex | Fábio determinou priorizar MCP. Ambas as conexões andre-calculos-vercel/vercel confirmaram somente Projeto Andre; list_projects vazio, get_project por ID esperado404 e list_deployments403/sem permissão. Dedicado também confirmou404 pelo nome. Preparado payload local deployment-mcp.json com 158 arquivos, target production e IDs explícitos | Evidência: docs/evidencias/mcp/validacao-2026-10-11.md. Auditor independente confirmou todos os bytes contra ZIP e main9a25f31, sem env vars/projectSettings; ZIP SHA-256 85d678b463ef38fe5d3e3ddfd36fe4fdf2cebf49c82cc85b9b808d56ba7a8859. Preflight aprovado, aplicativo idêntico à main verificada no CI38153083358; git diff --check aprovado, sem repetir npm run check por alteração somente documental. Sem envio, concessão, navegador ou CLI/API alternativa. Revisar acesso somente ao recurso, confirmar ID pelo MCP antes da publicação; M1.04a/M2.34d permanecem parciais. |

| 2026-10-11 | Codex | Fábio pediu resolver e confirmou consentimento somente ao projeto. OAuth oficial concluído; MCP dedicado listou somente equipe/projeto corretos e confirmou get_project/list_deployments. M1.04a e M2.34d concluídos: 158 arquivos da main9a25f31 publicados pelo MCP, deploy final dpl_D8FCmhRtUpTP4mftZr7RfbW6jeZ7 READY/production/gru1 e URL pública https://project-rucji.vercel.app/demonstracao | Evidência: docs/evidencias/mcp/validacao-2026-10-11.md e docs/evidencias/demonstracao/hospedada/validacao.json. Quatro testes hospedados em 375/1440 aprovados, axe A/AA sem violações, jornada completa fictícia e oito capturas. Primeira função em iad1 corrigida por update_project restrito à região e novo envio da mesma fonte; health HTTP200/gru1. Sem segredos novos, prodenv, compra, DNS próprio, banco ou comunicação real. Preflight aprovado, app idêntico à main com npm run check verde no CI38153083358; git diff --check e bash -n aprovados. Domínio temporário registrado no AGENTS e nos metadados locais. M1.50 comercial/integrado, GATEs e decisões humanas preservados. |

| 2026-10-11 | Codex | Retomada do objetivo de construção integral; M2.19a implementada com seis comandos exclusivos do calculista, revisão/retorno persistidos, recibo privado e evento/auditoria atômicos. Removida ponte prepareTechnicalReview da jornada. Descobertas M2.04a e M2.12a registradas abertas. MCP Vercel novamente confirmou somente equipe/projeto corretos e deploy READY | Evidência parcial: docs/evidencias/pedidos/operacoes.md. 358 unitários/doze scripts, lint/tipos e 36 testes reais de comandos/aceite aprovados; advisors locais sem achados. Quatro e2e de recuperação aprovados; motivo do histórico corrigido e jornada em repetição. npm run check local bloqueado apenas no build por porta interna Turbopack; CI ainda necessário. Nenhuma publicação, migration de nuvem, compra, segredo ou envio real. |

| 2026-10-11 | Codex | M2.19a concluída com comandos operacionais reais, histórico compartilhado e jornada sem preparação sintética da revisão. CI remoto completo aprovado; quatorze capturas locais inspecionadas e seis preservadas. M2.04a especificada com gate Auth e bootstrap por concessão privada de UUID | Fonte 45a32d9061f27de278981b120facfc98f3e5d732; CI38162207294: 358 unitários, doze scripts/build, 160 testes de banco, 117 e2e/sete omissões e advisors sem achados. PR #3; sem publicação das operações, migration na nuvem, compra, segredo ou envio real. |

| 2026-10-11 | Codex | M2.04a implementada no banco local: aceite booleano/versões obrigatórias, duas gravações de consentimento transacionais e bootstrap privado por UUID/TTL. Revisão independente encontrou espera atravessando a expiração e cliente Auth opaco; corrigidos por migration 0048 e helper com destino confirmado. Seed/creators temporários adaptados, sem consentimento inventado. Descoberta M2.04b registrada aberta | 24 testes específicos e 184 testes reais de banco aprovados; advisors locais sem achados, 358 unitários/doze scripts, formato/lint/tipos aprovados. Build local recusado na porta interna do Turbopack; seis e2e/duas omissões aprovados em 54,2 s, incluindo jornada completa; CI da nova fonte em validação. Nenhuma migration/Auth/segredo/infra alterado na nuvem. |

| 2026-10-11 | Codex | M2.04a verificada e PR #4 criado em rascunho, dependente de #3. Nova fonte passou no npm run check/build remoto; fonte local validada com Auth direto, grants privados e jornada responsiva. M2.04b detalhada para validar campos obrigatórios no banco antes de operação real | Fonte 2cab40d52b7adbd5e2f4e890400049c98fa202a7; qualidade do CI38163619398 aprovado. 24 específicos, 184 banco, seis e2e/duas omissões, advisors sem achados; suíte remota geral ainda em execução. Nenhuma publicação, migration, configuração Auth ou segredo alterado na nuvem. |

| 2026-10-11 | Codex | MCP Vercel revalidado após autorização exclusiva: equipe Projeto Andre, projeto andre-calculos e deploy de produção READY; continuidade M2.04b preparada no banco local, com validação canônica e celular internacional corrigido. Teste do parser real identificou contagem Unicode diferente; 0050 corrige 0049 sem alterar histórico aplicado | Chamadas nativas list_teams/list_projects/get_project/list_deployments confirmam team_4fdLDCsB0ROvP5ph50aFNvxm/prj_tdmzmC6utVU2fHPz0iVhroMD8NtI/dpl_D8FCmhRtUpTP4mftZr7RfbW6jeZ7. 121 específicos, 362 unitários/doze scripts e tipos/lint aprovados; build local recusado por porta interna Turbopack, nova fonte aguarda CI remoto. Suíte geral local em execução; nenhuma alteração na nuvem. |

| 2026-10-11 | Codex | M2.04b verificada com transporte real do parser e campos obrigatórios também no hook Auth; CPF/CNPJ/DDD/Unicode/tipos, ausência de persistência parcial e metadata posterior conferidos. PR #5 em rascunho criado e anexado; PR #3 concluiu seu CI completo com sucesso | Fonte/remoto 4af6407ca7c43410abe7da107603e9f85c32579a; 98 campos/24 jurídicos/282 banco, seis e2e/duas omissões em 59,6 s, 362 unitários/doze scripts, advisors locais sem achados. npm run check/build remoto aprovado no job qualidade do CI38164584726; geral remota em execução. Nenhuma mudança de Auth/migration/publicação na nuvem. |

| 2026-10-11 | Codex | M2.12a detalhada antes da próxima implementação, com revisão independente de PRD/RPCs: recusa pré-contratação, proprietário, ausência de qualquer aceite/pagamento, disputa serializada, recibo/replay, bloqueio de aceite posterior e preservação do PDF | Especificação em plan.md; somente preparo documental. D5/reembolso, produtor comercial, publicação e avisos externos continuam sujeitos às tarefas/insumos próprios. |

| 2026-10-11 | Codex | CI do PR #4 concluído integralmente com sucesso na fonte 2cab40d e PR marcado pronto para revisão; testes locais pós-M2.04b preservaram somente os quatro usuários/perfis/clientes fictícios, sem consentimentos ou grants residuais | CI38163619398: qualidade, banco, navegador e advisors aprovados; CI38164584726 do PR #5 permanece em execução, com qualidade/build aprovados. Consulta local: Auth 4/perfis 4/clientes 4/consents 0/grants 0. Nenhuma publicação ou alteração na nuvem. |

| 2026-10-11 | Codex | MCPs revalidados por chamadas nativas após confirmação do consentimento exclusivo; Vercel somente Projeto Andre/andre-calculos e Supabase qtofwbxujshroaafxowr. CI38164584726 completo aprovado e PR #5 pronto para revisão. M2.12a implementada e verificada no banco/navegador local, incluindo recusa imutável, disputa com aceite/pagamento e recuperação | 33 próprios/315 banco, 379 unitários/doze scripts, quatro e2e próprios e doze regressões de aceite/jornada em 375/1440 px; PDF textual preservado, axe/QA visual e advisors sem achados. docs/evidencias/orcamento/recusa/README.md. Build Turbopack local encontra restrição da porta interna; nova fonte aguarda CI remoto. Nenhuma alteração/publicação na nuvem. |

| 2026-10-11 | Codex | M2.12a concluída com npm run check/build remoto na fonte exata 51733913a6c501841abe3fa3ca49333ed42b4932; PR #6 criado em rascunho e anexado, dependente de #5/#4/#3 | CI38166216291 qualidade success, 315 banco local, 379 unitários/doze scripts, quatro e2e próprios e doze regressões em 375/1440 px; PDF/axe/capturas/advisors verificados. Suíte remota geral em execução. Read-back mantém apenas quatro usuários/perfis/clientes fictícios; zero recibos/contextos/consents/grants residuais. Nenhuma publicação ou alteração na nuvem. |

| 2026-10-11 | Codex | M3.00 preparada para aprovação: 32 especificações com Fazer/Pronto quando/Dependências, M3.01 dividida em três entregas e RF-47 reaproveitado de M2.23. Revisões independentes corrigiram sinal versus saldo, faturas sobrepostas após condição de contrato, confirmação manual de saldo e guardas de sucessão de propostas | Cobertura/formato e git diff --check aprovados; somente plan.md alterado na branch docs/especificacao-m3, código idêntico à fonte 5173391 com npm run check/build remoto aprovado. Aprovação do Fábio pendente; nenhum M3 implementado, decisão comercial/GATE marcado ou ação de produção executada. CI38166216291 geral preservado em execução; MCP nativo novamente confirmou somente equipe/projeto esperados e URL Supabase. |

| 2026-10-11 | Codex | CI38166216291 do PR #6 concluído integralmente com sucesso; 315 banco, 121 e2e/sete omissões, qualidade/build e advisors aprovados na fonte 5173391; PR pronto para revisão. Enquanto a aprovação de M3.00 permanece pendente, M2.28 dividida e M2.28a preparada com 16 modelos React Email em português, HTML/texto e projeção mínima sem transporte | 24 testes específicos, 403 unitários/doze scripts, formato/lint/tipos e 32 e2e em 375/1440 px aprovados; revisão independente de conteúdo e todas as 32 capturas, axe/largura/teclado sem achados. Build local recusado por porta interna do Turbopack, nova fonte aguarda CI. M2.35a registra um advisory alto preexistente propagado em cinco pacotes dev; audit omitindo dev retorna zero, sem concluir alcance no bundle ou revisão integral. MCP Vercel confirmou novamente só Projeto Andre/andre-calculos; preflight aprovado. Sem envio, Auth/segredo/migration/compra/publicação na nuvem. |

| 2026-10-11 | Codex | M2.28a concluída na fonte d065be6f0ffdc2e1f42f015d766ee79430cd5096: npm run check/build remoto aprovado no job qualidade 114555367460 do CI38168299312; 403 unitários/39 arquivos, doze scripts, 24 testes específicos e 32 e2e próprios/QA visual aprovados | PR #7 criado em rascunho e anexado, dependente de #6/#5/#4/#3; remoto e fonte conferidos. Suíte geral permanece em execução, fonte remota preservada. Preparada próxima coleta elegível de M2.35a: alcance no build/bundle, sem concluir ausência em produção ou revisão integral. M3.00 ainda aguarda aprovação; envio/SMTP/conta Resend e demais decisões humanas permanecem pendentes. |

| 2026-10-11 | Codex | Preparada coleta de M2.35a após build bem-sucedido do CI: inventário de hashes, traces NFT e candidatos diretos/incorporados ao Next, sem conteúdo privado ou paths absolutos. SHA real do checkout e fonte conferidos; extensão desconhecida, referência externa/ausente e symlink divergente deixam cobertura incompleta | Dez testes próprios/22 scripts, 403 unitários e formato/lint/tipos aprovados localmente; build local ainda impedido pela porta interna do Turbopack, coleta real pendente do CI. Duas revisões independentes sem bloqueadores após correções. Advisory e revisão integral permanecem abertos. MCP novamente confirmou somente Projeto Andre/andre-calculos e URL Supabase esperada; sem publicação, segredo, Auth, migration ou envio real. |

| 2026-10-11 | Codex | CI38168299312 do PR #7 concluído integralmente: qualidade/build, 315 banco, 153 e2e/sete omissões e advisors sem achados; PR pronto para revisão. Coleta real M2.35a no job qualidade 114558800055/CI38169457310, fonte b1a201f: 403 unitários/22 scripts/build aprovados e JSON sanitizado preservado | Fonte/checkout/pais do merge e hashes do lock/configuração conferidos. 35 traces/300 JS, zero referências/marcadores identificáveis; um symlink não resolvido mantém cobertura incompleta. Advisory/revisão integral abertos. PR #8 criado em rascunho e anexado; suíte geral em execução, fonte remota preservada. M3.00 ainda aguarda aprovação. |

| 2026-10-11 | Codex | M2.35a: o único contador de symlink não resolvido no artefato real não permite identificar a causa. Preparados diagnósticos sanitizados por motivo/artefato ou trace/índice, conservando cobertura incompleta e sem ler alvos de artefatos | Treze testes próprios/25 scripts e git diff --check aprovados; revisão independente estática sem bloqueadores. Fixtures conferem walk de arquivo/diretório, ciclo de resolução, symlink físico omitido e destino divergente. Coleta da nova fonte ainda pendente; CI38169457310 permanece vivo em e2e na fonte anterior b1a201f, sem cancelamento. Nenhuma origem remota atribuída por inspeção local e nenhum achado encerrado. |

| 2026-10-11 | Codex | M2.28c dividida para preparo local independente em M2.28d: três modelos nativos HTML/assuntos fictícios, ConfirmationURL integral preservada, CTA/alternativa e orientação do mesmo navegador/dispositivo. Renderizador comum com idioma pt-BR e título único; gerador resolve destino pelo arquivo e usa tsconfig explícito | Oito testes próprios/411 unitários/25 scripts, formato/lint/tipos e 38 e2e aprovados; seis capturas com QA visual e revisão de compatibilidade independentes sem bloqueadores. Build local impedido por porta do Turbopack, CI da nova fonte pendente. Templates não aplicados, nenhuma alteração Auth/SMTP/produção ou envio. M2.04c registra erro de link oculto e retorno automático ainda não provado pelo ensaio existente; M3.00 continua aguardando aprovação. |

| 2026-10-11 | Codex | MCPs revalidados após confirmação do consentimento exclusivo: somente Projeto Andre/andre-calculos, produção READY e Supabase qtofwbxujshroaafxowr. CI38169457310 completo aprovado na fonte b1a201f: 315 banco/153 e2e/sete omissões/advisors sem achados; PR #8 pronto. M2.28d concluída no preparo local com npm run check/build remoto aprovado na fonte03b4d77/job114562860596/CI38170815863 | 411 unitários/25 scripts e coleta real com 35 traces/300 JS. Diagnóstico sanitizado identifica artefato symlink ignorado de @react-pdf/renderer neste novo build, sem seguir alvo; hashes/fonte/checkout conferidos e JSON preservado. Advisory/revisão integral permanecem abertos; PR #9 geral em execução, fonte preservada. Sem alteração Auth/SMTP/produção, envio ou compra. M2.04c próxima correção local; M3.00 continua aguardando aprovação. |

| 2026-10-11 | Codex | M2.04c implementada e verificada localmente: aviso português fixo e formulário de novo link aberto; ensaio real descobriu retorno do callback para localhost apesar do acesso127.0.0.1. Callback usa agora APP_BASE_URL canônica, como o envio, com HTTP local/HTTPS e sem credenciais; caminhos seguros e no-store preservados | Sete testes próprios/418 unitários/25 scripts, formato/lint/tipos e 18 e2e/duas omissões planejadas aprovados; Mailpit confirma recovery→nova-senha, magic/cadastro→app sem navegação corretiva, inválido/replay com verifier e outro navegador sem sessão. Cadastro/jornada completa375/1440 e dois PNG com QA independente aprovados. Revisão estática sem bloqueadores; limpeza específica dos e-mails/usuários fictícios. Build local ainda impedido pela porta interna Turbopack; fonte aguarda CI. Nenhuma alteração Auth/SMTP/allowlist/credencial/produção. M3.00 permanece aguardando aprovação. |

| 2026-10-11 | Codex | M2.04c concluída na fonte9843f5df385ef072ab762191bf4e50aaa67e9b85: npm run check/build remoto aprovado no job114565777210/CI38171804330, com 418 unitários/25 scripts. PR #10 criado em rascunho e anexado; fonte/conta/remoto/repositórioID1414349093 verificados | Sete unitários próprios e 18 e2e/duas omissões planejadas locais, axe/foco/largura e QA visual independente aprovados. Suíte geral em execução nessa fonte e no PR #9, sem cancelamento ou novo push. MCP get_deployment confirmou produção READY/gru1 e alias temporário; novas mudanças não publicadas. App inalterado após confirmação remota, apenas registro/evidência/descrição atualizados; git diff --check aprovado. M3.00 e demais decisões/insumos humanos continuam pendentes. |

| 2026-10-11 | Codex | CI38170815863 do PR #9 concluído integralmente com sucesso na fonte03b4d778c8cc924ff2a3a25dd04911fb85e7899c; PR pronto para revisão após conferir jobs/logs completos | 411 unitários/25 scripts/check/build, 315 banco/159 e2e/sete omissões e advisors sem achados. Diagnóstico do inventário continua parcial pelo symlink ignorado; Auth/SMTP não alterados. M1.51 dividida antes do código em núcleo local, executor fictício e ativação externa; M3.00 segue aguardando aprovação. |

| 2026-10-11 | Codex | CI38171804330 do PR #10 concluído integralmente com sucesso na fonte9843f5df385ef072ab762191bf4e50aaa67e9b85; PR pronto para revisão após logs/jobs conferidos | 418 unitários/25 scripts/check/build, 315 banco/165 e2e/sete omissões planejadas e advisors sem achados. Fonte/checkout de merge fe9ba1fa0c54290a7ed969bf77d3dd0063aa8745 registrados; sem Auth/SMTP/produção alterados. M1.51a em validação local; M3.00 permanece aguardando aprovação. |

| 2026-10-11 | Codex | M1.51 dividida antes do código e M1.51a preparada no banco local: fila notifications existente, reservas exclusivas/replay, conteúdo congelado, recibos privados imutáveis em modo simulation, teto cinco e espera crescente; expiração/incerto bloqueados sem reenvio | 16 unitários próprios/434 totais/25 scripts, 25 próprios/340 banco gerais e advisors sem achados. Revisões independentes corrigiram lease/replay/vínculo/identidade held; migrations0052/53/54 preservam aplicação local. Lint só warnings preexistentes CPF/CNPJ. Docs/evidencias/notificacoes/fila/README.md. Build local encontra EPERM da porta Turbopack; nova fonte aguarda CI. Sem transporte, rota, cron, banco na nuvem, Auth/SMTP ou produção alterados. |

| 2026-10-11 | Codex | M1.51a concluída na fonte558a5c7ebefad7150302280a86efa8340c43cb91 após npm run check/build remoto aprovado no job114571144088/CI38173586727; PR #11 criado em rascunho e anexado | 434 unitários/43 arquivos, 25 scripts, 16 próprios/340 banco gerais/25 próprios locais e advisors sem achados. Limpeza read-back: zero reservas/recibos/trigger temporário/processo residual das fixtures. Suíte geral remota em execução; nenhuma alteração do head durante o CI. Executor fictício M1.51b próximo; produção/transportes/M3.00 e decisões humanas continuam pendentes. |

| 2026-10-11 | Codex | CI38173586727 do PR #11 completo aprovado na fonte558a5c7ebefad7150302280a86efa8340c43cb91, checkout73684941a06a1a018fdac0970428455e9d26dcbc; PR pronto para revisão. M1.51b implementada localmente: execução imutável de até25 posições, getters sem efeitos, transporte fictício persistente/idempotente e contagem de recibo efetivo | 434 unitários/25 scripts/build remoto do núcleo, 340 banco/165 e2e/sete omissões/advisors sem achados. Novo executor: 30 DB próprios/370 gerais, inclusive perda real da resposta e lote25/26; 43 unitários dos módulos/461 gerais/25 scripts, formato/lint/tipos e advisors sem achados. Revisões independentes sem bloqueadores. Build local EPERM preexistente; nova fonte aguarda CI. MCP dedicado confirmou somente Projeto Andre/andre-calculos e demonstração READY; nenhum transporte externo, endpoint, cron, nuvem, Auth/SMTP ou produção alterado. M3.00 segue aguardando aprovação. |

| 2026-10-11 | Codex | M1.51b concluída na preparação local: npm run check/build remoto aprovado na fonte85568bcd004d387ab216bba5c23a95fbef52962e/job114574690764/CI38174754842; PR #12 em rascunho criado e anexado, dependente de #11 e anteriores | 461 unitários/44 arquivos, 25 scripts, 30 próprios/370 banco gerais locais e advisors sem achados. Revisões independentes aprovadas e read-back zero runs/calls/deliveries/requests/receipts/triggers de fixtures. Suíte geral remota em execução; fonte preservada, sem novo push. Ativação externa/infraestrutura e aprovação M3.00 pendentes; nenhum cron/transporte/SMTP/Auth/nuvem/produção alterado. |

| 2026-10-11 | Codex | M2.35b especificada antes da implementação e coletor restrito preparado: somente alias PDF esperado, identidade manifestos/lock, opt-in CI, limites compartilhados, arquivos regulares e diagnóstico sanitizado | Revisões encontraram/corrigiram orçamento por alias, bytes reais, ordem lexical e diretório comum. 31 testes próprios/43 scripts/461 unitários e formato/lint/tipos aprovados; revisões independentes sem bloqueador. Build local EPERM; novo CI/relatório real pendentes; advisory e revisão integral abertos. MCP dedicado revalidado por chamadas reais: somente Projeto Andre/andre-calculos; projeto esperado e deploy dpl_D8FCmhRtUpTP4mftZr7RfbW6jeZ7 READY/gru1. CI38174754842 de #12 ainda em execução, fonte preservada. |

| 2026-10-11 | Codex | M2.35b concluída no recorte técnico após npm run check/build remoto da fonte62c8def76cfc5bdc1a867f97ce591a320cb7aac5, job114578103904/CI38175897388; PR #13 em rascunho criado e anexado | 461 unitários/43 scripts/31 próprios, formato/lint/tipos e revisões independentes sem bloqueador. JSON real byte a byte com hash fc458c53af5c1092fe7ce787889936113f8fafdeb88400051063ce7f40dfe517, source/checkout/pais/lock/configuração conferidos: 35 traces/301 JS e quatro JS/39.932 bytes do alias PDF, contadores zero. Sem prova de ausência de código ou integridade/equivalência; advisory/revisão integral abertos. Suítes gerais #12/#13 em execução, fontes preservadas; M3.00 aguarda aprovação. |

| 2026-10-11 | Codex | CI38174754842 completo aprovado na fonte85568bcd004d387ab216bba5c23a95fbef52962e, checkout447f99c42e34abff17f54ec1b7e98f455d645cf3 com pais main9a25 e fonte confirmados pela API; PR #12 pronto para revisão | 461 unitários/25 scripts/check/build e 370 banco/22 arquivos, 165 e2e/sete omissões planejadas/advisors sem achados. Logs conferidos; nenhum novo push no head. M2.35b também teve JSON real revisado independentemente sem bloqueador; PR #13 qualidade/build aprovados, suíte geral em execução e fonte62c8def preservada. Nenhuma publicação/infraestrutura/produção alterada. |

| 2026-10-11 | Codex | M1.52a desdobrada e especificada antes do preparo documental de docs/operacao.md, dentro do escopo de M1.52 | Manual local não comprova plano Pro, backup ativo, destino autorizado ou restauração real; M1.52/M3.22 e decisões de custo/retenção permanecem abertas. Preflight aprovado; MCP dedicado confirmou qtofwbxujshroaafxowr. CI38175897388 de #13 vivo em e2e, fonte62c8def preservada. |

| 2026-10-11 | Codex | M1.52a concluída no preparo documental: docs/operacao.md com fontes oficiais Supabase consultadas pelo MCP dedicado e páginas oficiais, responsáveis/destinos, backup/restore físico/lógico, matriz de conferência e ensaio mensal | Oito links/referências conferidos, diff --check e duas revisões independentes sem bloqueador. Corrigida especificação: clone físico inicia extensões externas imediatamente e não permite pausa prévia; inventário precisa corresponder ao ponto do backup. M1.52/M3.22 e decisões de custo/destino/retenção abertos; nenhuma cópia/restore/compra/segredo/nuvem/produção alterados. Código da aplicação idêntico à fonte62c8def com check/build remoto aprovado; CI38175897388 vivo em e2e, fonte preservada. |

| 2026-10-11 | Codex | M1.52a entregue na fonte79fc356c8c56579cc4375214d2f2275504cef7b3/PR #14 em rascunho criado e anexado; conta fabioalmeidadigital, remoto e repositórioID1414349093 conferidos antes do push | Fonte remota idêntica; aplicação/scripts/workflow sem diferenças contra62c8def, cujo check/build remoto passou. CI38176671146 confirmado vivo em qualidade/e2e; CI38175897388 de #13 confirmado vivo em e2e. Sem atualização dos heads durante os jobs, publicação, restauração ou compra. M1.52/M3.22/GATEs e aprovação M3.00 continuam pendentes. |

| 2026-10-11 | Codex | Revalidado o consentimento exclusivo pelo MCP andre-calculos-vercel: somente Projeto Andre/andre-calculos, IDs esperados e deploy dpl_D8FCmhRtUpTP4mftZr7RfbW6jeZ7 READY/production/gru1 | GETs públicos /demonstracao e /api/health HTTP200; health ok/gru1/v0.1.0. Evidência em docs/evidencias/mcp/validacao-2026-10-11.md. Ajustado o manual para conferir SHA na fonte do deploy: health atual não o informa. Somente documentação local; fontes remotas62c8def/79fc356 preservadas. Qualidade de #13 conferida novamente: 461 unitários/44 arquivos, 43 scripts, formato/lint/tipos/check/build aprovados; e2e ainda em execução, sem conclusão presumida. |

| 2026-10-11 | Codex | Qualidade da fonte79fc356/PR #14 confirmada por API/logs: CI38176671146/job114580408182 success, 461 unitários/44 arquivos e 43 scripts, formato/lint/tipos/check/build aprovados | Checkoute1e04c702bd6f2eab96b0d8992bd17f0ce95935d/pais main9a25f31 e fonte79fc356 conferidos; head remoto preservado e PR ainda rascunho. Suíte geral em execução, advisors não concluídos; sem marcar sucesso integral. Aplicação/scripts/workflow inalterados por esta revisão documental local. M1.52 real, M3.22 e aprovação M3.00 pendentes. |

| 2026-10-11 | Codex | Fábio aprovou M3.00: “Aprovar e continuar a implementação local”, em resposta ao detalhamento da fonte b9b687d | M3.00 documental concluída; 32 especificações aprovadas para dados fictícios locais. Contas, custos, decisões do André, publicação, operações reais e GATEs conservam condições próprias. Sem ativação externa. |

| 2026-10-11 | Codex | M2.28e desdobrada/especificada antes da implementação, para vincular payment_confirmed do cliente à confirmação manual de sinal | Branch feat/aviso-sinal-cliente, root único escritor e revisores somente leitura; preflight aprovado. Partes locais de M2.16/fila/modelos já verificadas permitem esse produtor sem Resend/nuvem/envio. M2.28b/M1.51c permanecem abertas; heads #13/#14 preservados, CIs e2e confirmados vivos. |

| 2026-10-11 | Codex | M2.28e implementada inicialmente na migration0056 e verificada em 25 testes de banco; revisão encontrou inversão de locks com update_own_profile | Migration0057 adquire perfil antes do cliente, reconfere owner_id e não antecipa validação de contato em replay/zero. Especificação atualizada e ensaio concorrente acrescentado; remoção de asserção com número em UUID elimina flake. Sem alteração de permissões/transporte/nuvem. Check local passou formato/lint/tipos/461 unitários/43 scripts; build continua encontrando o EPERM preexistente da porta interna Turbopack, aguardando comprovação remota da nova fonte. |

| 2026-10-11 | Codex | M2.28e: 383 testes gerais/23 arquivos aprovados; após ampliar contato inválido e limitar sessão SQL auxiliar, 26 testes próprios/regressões aprovados novamente | Advisors segurança/desempenho sem achados; lint SQL aponta oito avisos preexistentes nos validadores CPF/CNPJ, sem erro no caso alterado. Read-back57 migrations, 25 públicas/22 privadas todas RLS, zero intenções/recibos/avisos/reservas/triggers/sessões restantes. Formato/lint/tipos aprovados novamente; duas revisões por leitura sem bloqueador. Check/build remoto da nova fonte ainda pendente; M2.28e aberta e sem despacho real. |

| 2026-10-11 | Codex | CIs #13/38175897388 e #14/38176671146 concluídos success; conta/repo/heads/checkouts/pais verificados, PRs prontos para revisão | Cada fonte: 370 banco/22 arquivos, 165 e2e/sete omissões planejadas, 461 unitários/44 arquivos, 43 scripts/check/build e advisors sem achados. PR #15 criado/anexado na fonte34fbd3342baeec5546b156dc11c8ee677a4271af, CI38178146136 em execução; heads remotos preservados. Sem merge/publicação. |

| 2026-10-11 | Codex | M2.28e concluída no preparo/verificação local: check/build remoto aprovado na fonte34fbd3342baeec5546b156dc11c8ee677a4271af/PR #15, CI38178146136/job114584808935 | 461 unitários/44 arquivos, 43 scripts, formato/lint/tipos/build aprovados; checkout5e39ba39e6b1fb36f480141298c04133c9f682ec/pais main9a25f31+fonte conferidos. Log sanitizado hashbd4cbb6c4dc31884d04e5fc3fed38a353b6170a2a84ee14adcbe96a9615f813f. Suíte geral remota viva, PR rascunho/head preservado; sem claim de CI integral. Próxima M3.01a autorizada. |

| 2026-10-11 | Codex | CI38178146136/e2e114584808772 terminou failure: 382/383 banco, teste de perfil concorrente lê phone nulo no seed limpo | M2.28e reaberta; check/build da fonte34fbd33 permanecem aprovados, mas navegador/advisors remotos foram omitidos. Correção do teste fornece campos fictícios válidos e restaura snapshots originais inclusive null; ampliar ensaio com perfil mínimo antes de nova fonte. Sem alteração da migration/produção. |

| 2026-10-11 | Codex | Fixture concorrente M2.28e corrigida e ampliada para perfil completo/mínimo; 27 testes específicos/regressões aprovados, revisão final sem bloqueador | Campo reproduzido é profiles.phone nullable; clients.legal_name é NOT NULL e mantém snapshot original. Rodada intermediária383/384 identificou setup inválido com legal_name null, retirado antes da nova fonte. Finally restaura5 camposperfil e legal_name; migrations/caso de uso inalterados. Nova fonte aguarda CI. |

| 2026-10-11 | Codex | Correção do ensaio M2.28e enviada na fonte5d3db8a1f63758e0a619605052f30e60e3af1153/PR #15; CI38178835637 iniciado | Rodada anterior38178146136 terminal failure antes do push; fonte nova preservada. 27 testes locais, formato/lint/tipos e revisão do delta aprovados. M2.28e aguarda check/build e banco remoto; M3.01a permanece próxima após concluir. |

| 2026-10-11 | Codex | M2.28e concluída na fonte corrigida5d3db8a1f63758e0a619605052f30e60e3af1153/PR #15, CI38178835637 | Qualidade114586864386 success: 461 unitários/44 arquivos, 43 scripts/check/build; checkout8d74e4e2f6132189589b192264286b4ef1a2b65a/pais main9a25+fonte conferidos, log sanitizado hash929e55c55450462b521e5036b94968f9de09ee39c4eed9f0afc46825776412a0. Etapa banco114586864267 success22:08:30UTC confirmada pela API; número remoto aguarda log final. 27 específicos/regressões locais, revisão/cleanup aprovados. Navegador remoto vivo/advisors pendentes; sem CI integral/merge/publicação. Próxima M3.01a, com aprovação do Fábio registrada. |

| 2026-10-11 | Codex | M3.01a desdobrada antes da implementação em M3.01d/e/f: contratos precisos, adaptador e eventos financeiros | Escopo aprovado preservado; parent permanece aberto até três entregas verificadas. Branch feat/adaptador-asaas, root único escritor; preflight aprovado. Documentação oficial consultada: account.id não é walletId, originalValue pode diferir do pago e refunds DONE são distintos de pendentes. M3.01d iniciada sem segredo/API autenticada/banco/publicação; CI15e2e vivo confirmado. |

| 2026-10-11 | Codex | CI38178835637 do PR #15 inteiro success, fonte5d3db8a preservada; M3.01d contratos somente servidor preparados com135 testes específicos/596 unitários gerais | Logs/API confirmam384 banco/23 arquivos, 165 e2e/sete omissões e advisors sem achados para#15; checkout8d74e4/pais conferidos. M3.01d: JSON limitado/lossless, BigInt compatíveltarget, scopes/IDs distintos, documentos/DDD/nomeUnicode e observações financeiras; formato/lint/tipos/43scripts/revisões aprovados. Build local EPERM conhecido; fonte nova aguarda check/build remoto. Sem API/banco/segredo/operação financeira. |

| 2026-10-11 | Codex | M3.01d concluída: qualidade114593253417/CI38180969695 success na fontea2cb04a87e23ae85581d2eb7f42881dfc24b7dae/PR #16 criado/anexado | Log real sanitizado confirma596 unitários/47 arquivos,43 scripts/check/build; checkout0cb19ffdc2b7798582467a06d9629d637cc16d71/pais main9a25+fonte conferidos, hashfa40a743571c83dfee8bb34007f73aaecd0db5911ba2ef3b1f834d200e236a5e. Fonte remota preservada enquanto e2e114593253251 vivo. Próxima M3.01e; parentM3.01a aberto. Sem driver/segredo/banco/pagamento/envio/publicação. |

| 2026-10-11 | Codex | M3.01e iniciada: branch feat/transporte-asaas, root único escritor e preflight aprovado | Documentação/revisão confirmam ausência de garantia de idempotência, 404 possível por conta divergente e notificações reais até no sandbox. Política local refinada antes da implementação: fixture explícita, busca de unicidade limitada, vencimento/meio/cliente e resposta perdida sem repetição. Sem segredo/API autenticada/banco/publicação. |

| 2026-10-11 | Codex | M3.01e preparada e ensaiada localmente: criação/consulta/busca/fatura com porta fixture explícita | 136 casos novos,732 unitários/49 arquivos e43 scripts, formato/lint/tipos aprovados. Corpo mínimo/centavos exatos, vínculos e listas, resposta perdida sem retry e fatura com valor divergente bloqueada. Duas revisões confirmam correção e ausência de bloqueador. Check local chega ao EPERM conhecido; falta check/build remoto. Sem driver externo/segredo/banco/pagamento/envio/publicação. |

| 2026-10-11 | Codex | M3.01e concluída no preparo/verificação: qualidade114597378029/CI38182349916 success na fonte58f61cf291295672e8fa5c75d0cd1fa4b35a6893/PR #17 criado/anexado | Log real confirma732 unitários/49 arquivos,43 scripts/check/build, checkout3d803ab3b5083348dc2dad0f7cbe8be19ff4ac25/pais main9a25+fonte e hash773a8f23183863245596367206e725d76190d06fdb56baef609747e04f76d526. Fonte remota preservada enquanto suíte geral viva, PR rascunho. Próxima M3.01f; parentM3.01a aberto. Sem driver externo/segredo/banco/operação financeira/envio/publicação. |

| 2026-10-11 | Codex | CI38180969695 do PR #16 integralmente success; fonte a2cb04a preservada | Logs/API confirmam384 banco/23 arquivos,165 e2e/sete omissões e dois advisors sem achados; checkout0cb19ff/pais main9a25+fonte/head conferidos. Sete test.skip limitados ao computador conferidos no código do head exato, não listados pelo reporter; contagem coincide. Extrato sanitizado hashf5d09836713b532caca09e53176cc88a06dfa34d5f7a655cebfaa5acd7d5c3d7. PR #16 pronto para revisão, sem merge/publicação. CI17geral vivo; próxima M3.01f. |

| 2026-10-11 | Codex | M3.01f iniciada: branch feat/eventos-financeiros-asaas, root único escritor/preflight aprovado | Turno anterior foi progresso: M3.01e fonte58f61cf/check/build remoto aprovado. CI17geral confirmado vivo em e2e114597378161. Fontes oficiais/revisões fundamentam presença explícita, recebido vs confirmado, estornosDONE cumulativos, chargeback sem montante e comparação sem delta/ordenação causal inventada. Sem segredo/API/banco/efeito/publicação. |

| 2026-10-11 | Codex | M3.01f preparada/ensaiada: normalização e comparação cumulativa somente servidor | 146 próprios/878 unitários gerais/50 arquivos e43 scripts/formato/lint/tipos aprovados. Revisões corrigiram estado/estorno em qualquer envelope, deniedsóBOLETO, semânticaVIEWED→RECEIVED, regressão e CONFIRMEDpermanente. Erro de patch sobrescreveu suíte antes decommit; recuperada da chamadaoriginal da sessão, todos os casos preservados e checkfinal executado. Build local EPERM conhecido; falta check/build remoto. Sem banco/segredo/driver/pagamento/efeito/publicação. |

| 2026-10-11 | Codex | CI38182349916 do PR #17 integralmente success: fonte58f61cf preservada | Log/API confirmam384 banco/23 arquivos,165 e2e/sete omissões e dois advisors sem achados; checkout3d803ab3b5083348dc2dad0f7cbe8be19ff4ac25/pais main9a25+fonte/head conferidos. Sete test.skip no head mantêm a condição computador e não houve alteração de suíte e2e desde#16. Extrato hash3bc18c3cb5857618ad962693970762d1970f13077b929de8677836c202add2c0. PR #17 pronto para revisão, sem merge/publicação. CI18fonte3dabd4d viva; próxima M3.01b após verificarF. |

| 2026-10-11 | Codex | M3.01f e preparo local de M3.01a concluídos: qualidade114601844053/CI38183836577 success na fonte3dabd4dd888749f2dd0398fc2af0e85d5266083f/PR #18 criado/anexado | Log real confirma878 unitários/50 arquivos,43scripts/check/build; checkout52650030f80793a5a4291af4504a3c5577dab10d/pais main9a25+fonte e hash3ffe25ab2a8944fd2b72987cf35d17e80572f9fb9ee1dea417674411b336ba7d. 146 novos/414Asaas, duas revisões finais sem bloqueador. Fonte remota preservada com e2e114601844105 vivo/PR rascunho. Próxima M3.01b; M3.01/driver/autenticidade/suporte real de documentos/ensaios continuam abertos. Sem banco/segredo/efeito financeiro/envio/publicação. |
| 2026-10-11 | Codex | M3.01b dividida antes da implementação em g/h/i/j/k, preservando o escopo aprovado de cobrança, conciliação e crédito | Iniciada M3.01g: somente vínculos/obrigações fixture e contexto imutável local. Partes posteriores cobrem reservas, execução retomável, crédito comum e fatura/jornada. Revisões detectaram divergência de datas e proteção do getter; correções e testes locais em andamento. Parent e todas as partes permanecem abertas. |

| 2026-10-11 | Codex | CI38183836577 de #18 fechado success, fonte3dabd4d preservada e PR pronto para revisão | Log/API:384 banco/23 arquivos,165 navegador/sete omissões planejadas, dois advisors sem achados; checkout52650030f80793a5a4291af4504a3c5577dab10d/pais main9a25+fonte/head conferidos. Extrato0410e60d9a84cf78aa5e8a9b0bfdac1cfa41742c0bc9209d9118030b62b1b528. Sem merge/publicação. M3.01g em implementação/verificação local. |

| 2026-10-11 | Codex | M3.01g preparada localmente: obrigações fixture, contexto imutável e RPCs auditados; verificação final em andamento | Migration0058 reexecutada no banco dedicado local após corrigir datas1900/locks de autorização.50 unitários próprios,19 banco próprios/403 gerais em24 arquivos, advisors segurança/desempenho sem achados e duas revisões. Positivos proprietário/calculista, imutabilidade scope/cliente/contexto e corridas owner/role/crédito comprovadas. Duas falhas de fixture corrigidas; o check detectou tipagem da nova asserção e foi corrigida antes do commit. Build local sujeito ao EPERM conhecido, remoto será conferido na fonte preservada. Sem intenção/POST/crédito/publicação. |

| 2026-10-11 | Codex | Fonte final de M3.01g verificada antes do push:50 unitários próprios/928 gerais,19 banco próprios/403 gerais | Formato/lint/tipos/43 scripts aprovados;19 casos finais reexecutados após reforços do calculista/imutabilidade/timeouts. Check local parou somente no build EPERM do Turbopack/porta interna PDF; extrato36758c9d10fd483a7a247a8c2c41bfac8ebb9647b8dffc3cffb0bd54cf7e69e9. Advisors sem achados; nova PR será rascunho até verificar a fonte no CI. M3.01g/parentM3.01b abertos. |

| 2026-10-11 | Codex | M3.01g concluída no preparo/verificação local: qualidade114608059274/CI38185910157 success na fonte86895f48d911c1f6365ca3a0461aaff6cb4e4c33/PR #19 criado/anexado | Log real:928 unitários/51 arquivos,43 scripts/check/build e sete páginas; checkoutc241483a3db6cd7386b54d8d2d0045d104e52bec/pais main9a25+fonte conferidos, extratoc6cc3c41e8c37e5b79dc3274457a1297e9704cacd24d1228f2f872a36df2615e. 50 unitários/19 banco próprios/403 gerais locais, advisors e duas revisões sem bloqueador; read-back zero scopes/bindings/contextos/configuração e quatro perfis. E2e114608059025 vivo, head preservado/PR rascunho. H dividida antes de começar em l/m, preservando escopo; próxima l. ParentM3.01b e operação externa permanecem abertos. |

| 2026-10-11 | Codex | Iniciada M3.01l na branch feat/reservas-cobranca: reserva por pedido e intenção/replay imutáveis | Preflight GitHub/origin/cofre exclusivo aprovado; M3.01g verificada. Escopo fixture, sem despacho/crédito. Retirada exige autorização vigente e ausência de claim durável; coordenação manual/contrato permanece em m. CI19fonte86895f4 segue vivo, sem restart ou mudança de head. |

| 2026-10-11 | Codex | CI38185910157 de #19 fechado success na fonte86895f4; PR pronto para revisão | Logs reais:403 banco/24 arquivos,165 navegador/sete omissões planejadas, dois advisors sem achados; checkoutc241483a3db6cd7386b54d8d2d0045d104e52bec/pais main9a25+fonte/head conferidos, extrato5081b8ebd1052dd0c2d11975dfd3c906b5d2db05eeb969aaf0339de734e1b5d7. Fonte preservada, sem merge/publicação. |

| 2026-10-11 | Codex | M3.01l preparada localmente: migration0059, intenção/reserva/requests/retirada/claim privado e getters auditados |43 unitários/22 banco próprios e971 unitários/425 banco gerais aprovados; setup transacional e snapshots protegidos corrigidos após revisão, FKs request/retirada testadas especificamente. Formato/lint/tipos/43 scripts aprovados, advisors sem achados e duas revisões finais sem bloqueador. Build local parou só no EPERM conhecido, extrato420a486f583572cffbf16cdd2edb29ec077c925d4b9452ec04024bc92c28e0d4. Read-back zero intenções/reservas/requests/claims/retiradas/contextos/scopes/bindings/configuração e quatro perfis. Dois novos casos de retirada concorrente exigem nova verificação; l/h/parentb abertos até fonte/check final. Sem despacho/crédito/nuven/publicação. |

| 2026-10-11 | Codex | Fonte final de M3.01l verificada localmente:24 banco próprios/427 gerais e43 unitários próprios/971 gerais | Dois casos adicionais de retirada concorrente com UUID igual/diferente passaram;25 arquivos de banco e52 de unidade, formato final aprovado. Role/owner/conta/fase/replay e rollback físico; advisor/revisões sem bloqueador. L permanece aberta até check/build remoto da fonte; parenth/M3.01b e m/i/j/k abertos. |

| 2026-10-11 | Codex | M3.01l concluída no preparo/verificação local: qualidade114614038683/CI38187868946 success na fonte7daef30d5d1f341f08cc0717074961559f433f18/PR #20 criado/anexado | Log real confirma971 unitários/52 arquivos,43 scripts/check/build/sete páginas; checkout49f87d56dec923aa904a2f296946c0e0aa87aa7b/pais main9a25+fonte e extratodac71b90476689e651e8a9056d58bae25f13a7f02ab4ba3b79289d1bfcfbf44d conferidos.43 unitários/24 banco próprios/427 gerais, advisors e duas revisões sem bloqueador; read-back limpo. E2e114614038541 vivo/PR rascunho/head preservado, sem declaração de CI integral. Próxima M3.01m; h/parentb e ativação externa abertos. Sem pagamento/POST/crédito/nuven/envio/publicação. |

| 2026-10-11 | Codex | Iniciada M3.01m na branch feat/coordenacao-cobrancas, após preflight OK e aprovação local de M3.00 | Nova0060 evolui Pix manual/contrato, com guardas para qualquer reserva ativa e replay/zero preservados. Ensaios locais fictícios de concorrência, rollback, avisos e auditoria; sem provedor externo ou publicação. |

| 2026-10-11 | Codex | CI38187868946 integralmente success na fonte7daef30d5d1f341f08cc0717074961559f433f18/PR #20 | Log e2e114614038541 confirma427 banco/25 arquivos,165 navegador/sete omissões planejadas e dois advisors sem achados. Checkout49f87d56dec923aa904a2f296946c0e0aa87aa7b/pais/head conferidos; extrato5908ce01659d10117065bc93f5d806e8dcb874b6ef32528b6d06d595862ea43b. Fonte preservada; PR pronto para revisão. |

| 2026-10-11 | Codex | M3.01m verificada localmente:0060,20 banco próprios/447 gerais em26 arquivos,6 unitários próprios/977 gerais em53 arquivos,43 scripts; dois navegador375/1440 comAxe, advisors e revisões sem bloqueador | Fixture do navegador encontrou import server-only antes da coleta; schemas puros separados, mantendo entrada pública/casos de uso e leitor Asaas restritos ao servidor. Jornada final e tipos verificados. Check local chega ao build e falha na porta interna do Turbopack, sem contorno; log local69e6d14a15caaf18af176d3f623308b1dc2ddb5cfa5457d8dcc10061362c948a. Fonte final/CI ainda pendentes; sem migração na nuvem, POST, cobrança ou publicação reais. |

| 2026-10-11 | Codex | Fonte final de M3.01m preparada para revisão na feat/coordenacao-cobrancas |63 casos de banco de obrigações/reservas/coordenação reexecutados após extração dos parsers, dois navegador375/1440 comAxe aprovados e quatro capturas preservadas/inspeção representativa. Read-back:60 migrations,25 tabelas públicas/31 privadas, zero metadados/reservas/recibos contratuais e quatro perfis. Ambas as revisões finais sem bloqueador. PR #20 marcado pronto após CI integral/head conferidos; fonte20 preservada. |

| 2026-10-11 | Codex | M3.01m e M3.01h concluídas no preparo/verificação local:fonte43e5096bacd383b5628ca9c31c5e956897ab7148/PR #21 criado/anexado | Log real de qualidade114618881288/CI38189462022 success confirma977 unitários/53 arquivos,43 scripts/check/build/sete páginas; checkout01a4426a144caaa06cc739aad1f39cb239f8e038/pais main9a25+fonte e extrato736186962b7b954c027daea128dc379d8b81347436174d6e3c65f165376c0766 conferidos.447 banco/26 arquivos e63 focados finais, dois navegador/Axe375/1440, read-back limpo e revisões sem bloqueador. E2e114618881423 vivo/PR rascunho/head preservado; sem declaração de CI integral. Próxima i; parentb/M3.01 e ativação externa abertos. Sem mudança na nuvem, cobrança ou publicação reais. |

| 2026-10-11 | Codex | Iniciada M3.01i e desdobrada tecnicamente em n/o/p antes da escrita de código; branch feat/provedor-ficticio-duravel, preflight OK | Leituras de0059/porta mostram bootstrap customer anterior aG, resultado interno separado de solicitação pública e simulador que não deve ocultar duplicatas. Ordem n→o→p mantém jornada completa e i/parentb abertas até provas integrais. Escopo local fictício aprovado de M3.00 preservado; sem operações externas reais. |

| 2026-10-11 | Codex | CI38189462022/PR #21 integralmente success na fonte43e5096bacd383b5628ca9c31c5e956897ab7148 | Log real e2e114618881423 confirma447 banco/26 arquivos,167 navegador/sete omissões planejadas e dois advisors sem achados. Checkout01a4426a144caaa06cc739aad1f39cb239f8e038/pais main9a25+fonte/head conferidos; extrato6310605f488b0aecc2e122bbb41553e3b301a34f696441e41787fd7816d16675. Fonte preservada, PR pronto para revisão; sem merge/publicação. |

| 2026-10-11 | Codex | M3.01n implementada/ensaiada localmente na feat/provedor-ficticio-duravel:0061+porta interna fixa |34 unitários próprios/1011 gerais/54 arquivos e25 banco próprios; replay com duas invocações/um fato, concorrência/novo processo, perdas pós-criação, duplicatas/hasMore, tipos JSON e scopes verificados. SQL draft foi corrigido/reaplicado antes de congelar fonte; getters conferem scope do resultado, candidatos da lista incompleta têm IDs distintos. Advisors e duas revisões sem bloqueador; regressões gerais/CI pendentes. I não fecha; customer bootstrapO e claim/retomadaP permanecem no escopo. |

| 2026-10-11 | Codex | M3.01n:suíte geral local aprovada com472 banco/27 arquivos e1011 unitários/54 arquivos,43 scripts |Check local passa formato/lint/tipos/testes/scripts e esbarra na restrição conhecida de porta interna do Turbopack; log69199d388afc4ca59348461b497b30d1804e0d871d04605f4f275ca6eedba9dd. Fonte final/check-build no CI pendentes; sem contorno da restrição. |

| 2026-10-11 | Codex | M3.01n concluída no preparo/verificação local na fonte ce6c3a211bee3110387664a345774a835a869d87/PR #22 criado e anexado | Qualidade114625508727/CI38191659515 success:1011 unitários/54 arquivos,43 scripts/check/build/sete páginas; checkout8cd4dee44c3d28f4682c9bcaef883ac77ce7985a/pais main9a25+fonte conferidos, extrato7c98fadb7758e3bfac24e99b4dec7961baba81fd267500bf16a93513cc2bacd3. 472 banco/27 arquivos locais,34 unitários/25 banco próprios, advisors/read-back limpo e duas revisões sem bloqueador. Suíte geral remota viva/PR rascunho/fonte preservada; fechamento documental local não reinicia CI. Próxima o; i/parentb/M3.01 e condições externas abertos. |

| 2026-10-11 | Codex | Iniciada M3.01o após validação local de n; branch feat/vinculo-cliente-retomavel, preflight OK | Desenho revisto por dois agentes somente leitura: solicitação humana e processamento service_role separados, snapshot privado, claim monotônico, slot novo para consulta nova, notificações desativadas também em GET/find e referência clients.id. Fonte de n preservada enquanto CI geral38191659515 permanece vivo. Escopo local fictício aprovado mantido. |

| 2026-10-11 | Codex | M3.01o implementada localmente:0062, solicitação/worker separados e operação por conta/cliente |19 unitários próprios/1030 gerais/55 arquivos e25 banco próprios aprovados. Corrigida guarda de POST anteriorN e corrida entre alocação/start: marco permanente só no start consumível, sem alterar revisão. Novo processo recupera resposta perdida; finalização confere recibo/scope/payload e não aceita resultado livre. Worker extraído das sessões Next para execução servidor independente. Full banco/advisors/fonte final/CI pendentes; condições externas mantidas. |

| 2026-10-11 | Codex | Suíte geral local O aprovada:497 testes de banco/28 arquivos,1030 unitários/55 arquivos e43 scripts | Check final passa formato/lint/tipos/testes/scripts e encontra a restrição conhecida de porta interna do Turbopack no build; log4159a68269c69e25f1f2eeb38fe0ff5d498952e17bc020e86f337d688908cdba. Fonte final/compilação no CI pendentes; sem contorno. Limites do filho e cleanup aninhado ajustados; final próprio/read-back/advisors em coleta. |

| 2026-10-11 | Codex | Fonte O preparada para revisão:25 banco próprios reexecutados no harness final, advisors de segurança/desempenho sem achados | Read-back62 migrations,25 tabelas públicas/40 privadas, markerfalse, zero work/requests/steps/fatos/recibos/scopes/bindings/contextos/intents e quatro perfis. Duas revisões sem bloqueador funcional; limites de filho/cleanup ajustados.497 banco gerais locais; fonte final e check/build no CI pendentes. Parent i/b/M3.01 permanecem abertos. |

| 2026-10-11 | Codex | CI38191659515/PR #22 integralmente success na fonte ce6c3a211bee3110387664a345774a835a869d87 | Log real e2e114625508902 confirma472 banco/27 arquivos,167 navegador/sete omissões planejadas e dois advisors sem achados. Checkout8cd4dee44c3d28f4682c9bcaef883ac77ce7985a/pais main9a25+fonte/head conferidos; extrato8ed18c35919e6812ef7621b75f20aebeab37ec50c6b7bb06173b916191ef5158. Fonte preservada; PR pronto para revisão, sem merge/publicação. O fonte d378896e7af3909c9243b1bc41d8017fd09385e4/PR #23 criado/anexado, CI38193268625 iniciado/fonte congelada. |

| 2026-10-11 | Codex | M3.01o concluída no preparo/verificação local: fonte d378896e7af3909c9243b1bc41d8017fd09385e4/PR #23 criado e anexado | Qualidade114630377341/CI38193268625 success:1030 unitários/55 arquivos,43 scripts/check/build/sete páginas; checkoutf56eedd4c7b41eeb9bcc51f629b28cb87fcf8a7a/pais main9a25+fonte conferidos, extrato1865616bb7338492d3c22f8715cf4608c61d8e86f783cca735bd0a948c96fe95. 497 banco locais/25 próprios reexecutados, advisors/read-back e revisões sem bloqueador. E2e114630377216 vivo/PR rascunho/fonte preservada; fechamento documental local não reinicia CI. Próxima p; i/parentb/M3.01 e condições externas permanecem abertos. |

| 2026-10-11 | Codex | Iniciada M3.01p na feat/emissao-retomavel-cobrancas, preflight OK; desdobrada antes do código em q/r/s | Três partes conservam autorização/transporte/resolução/jornada. Revisões somente leitura confirmam helper0059 dependente deauth.uid não serve ao sistema, marcador permanente nasce no start e históricoN bloqueia repetição. Fonte23 preservada com CI38193268625 vivo. Escopo local fictício aprovado mantido. |

| 2026-10-11 | Codex | Q implementada localmente:0063+descritor privado/start/getter humano |29 unitários e20 banco próprios aprovados, inclusive corrida de workers/retirada e rollback. Guardas de metadataISDISTINCTFROM, contextoISNOTTRUE, requestID no envelope e coerência claim/reserva reforçadas após duas revisões. Full banco43495 vivo; checklocal encontra restrição conhecida de porta interna do Turbopack, sem contorno. Qnão despacha;R/S/P/I preservados abertos. Fonte final/CI pendentes. |

| 2026-10-11 | Codex | Qsuite geral local aprovada:517 banco/29 arquivos,1059 unitários/56 arquivos e43 scripts | Advisors de segurança/desempenho sem achados, duas revisões sem bloqueador e read-back63 migrations/25 tabelas públicas/42 privadas, zero runs/steps/customerWork/fatos/recibos/intenções/claims/reservas/scopes/bindings/contextos, quatro perfis e markerfalse. Check local esbarra na porta interna do Turbopack; logc77bb600a9f3f0caec69151e43f0050fd54835707bac208175bd0ca5ed1745d9, sem contorno. Fonte final/compilação no CI pendentes; sem emissão ou resolução. |

| 2026-10-11 | Codex | M3.01q concluída no preparo/verificação local:fonte b2cab864e38647a698ff0ae8c5d30901211b9dcb/PR #24 criado/anexado | Qualidade114634026254/CI38194478429 success:1059 unitários/56 arquivos,43 scripts/check/build/sete páginas; checkoutbbdbd2246a41e9188426c10ffcd7389cee4acc29/pais main9a25+fonte conferidos, extratoa75f43b66008318cc3ebcaaa4627221f2d04bf1818b19652ddd4ede71f52c025.517 banco locais/20 próprios, advisors/read-back limpo e revisões sem bloqueador. E2e114634026166 vivo/PR rascunho/head preservado; fechamento documental local não reinicia CI. Próxima r; transporte/resolução e parentp/i/b/M3.01 continuam abertos. |

| 2026-10-11 | Codex | Iniciada M3.01r apósQverificada, branchfeat/transporte-observacao-cobrancas/preflightOK | Revisões somente leitura confirmam wire compartilhado, expectativa antesstart, receiptN autoritativo, normalização lossless de candidato e finalização comfencing. SemparserfinanceiroSQLduplicado/resultado deusuário/crédito; Rmantém S/P/I abertas. CI23/24 vivos, fontes preservadas. |

| 2026-10-11 | Codex | CI das fontes O/Q integralmente aprovado; PR #23/#24 prontos para revisão | Fonte23 d378896e7af3909c9243b1bc41d8017fd09385e4/CI38193268625/e2e114630377216: 497 banco/28 arquivos, 167 navegador/sete omissões e dois advisors sem achados, extrato8c761bca17484c1e6b37363f5a41c8585e73092ac3173343b1c6d6fa1b775e1a. Fonte24 b2cab864e38647a698ff0ae8c5d30901211b9dcb/CI38194478429/e2e114634026166: 517 banco/29 arquivos, 167 navegador/sete omissões e dois advisors sem achados, extrato63853d2a8585a47c41a8a2cb6cdb3aa5ab90c32cae0c1749ca384ebc51116905. Checkout/pais/head e metadados finais conferidos, fontes preservadas; sem merge ou publicação. |

| 2026-10-11 | Codex | M3.01r implementada localmente: protocolo antes do start, transporte fixo e observação ligada à fonte | 24 banco próprios e8 novos unitários/1067 gerais/56 arquivos,43 scripts aprovados. Normalização lossless/F, UNDEFINED original, resposta perdida em processo distinto, duplicatas/consultas insuficientes, fencing/replay/rollback/autorizações conferidos. Cleanup de setup corrigido e ensaiado; duas revisões somente leitura sem bloqueador. Check local falha apenas no build por porta interna Turbopack, extrato33b5090eda6677b9e8c51434e715baecbeaa895068f0c765b0591629b87a0f5a; geral/advisors/read-back/fonte final/CI pendentes. Sem crédito/liberação/publicação; S/P/I abertas. |

| 2026-10-11 | Codex | M3.01r suíte geral local/advisors/read-back aprovados; preparação da fonte final | 541 banco/30 arquivos,24 próprios;1067 unitários/56 arquivos e43 scripts. Banco extrato1ec76ae12dbf9ae9ff3260fb0f7ab67053cb10d2d36539ae45e38dcc9f7af8d6. Advisors segurança/desempenho sem achados (97540f3494191882bfdb34e0ce0f4c388fadcbcc74d8eb41200ead6110c07daa). Read-back64 migrations/25 públicas/44 privadas comRLS/quatro perfis/markerfalse e zero dados ou metadata de pagamentos (61d505fd5c44d532a5d3fde4a27dd979719826a95f823ddda60ba6909500036e). Preflight GitHub/1PasswordOK, duas revisões sem bloqueador. Check/build da fonte final no CI pendente; resoluçãoS/P/I/parentb/M3.01 abertos. |

| 2026-10-11 | Codex | Fonte R9272dbd2084295e28ba23090dba45bd5280d3250/PR #25 criada e anexada | Preflight/identidade GitHub fabioalmeidadigital/repo público1414349093/main9a25 conferidos. CI38196795022 iniciado; PR rascunho e fonte preservada durante execução. Código local limpo no envio; fechamento documental posterior só local, sem reiniciar CI. Check/build fonte final pendente; S/P/I/parentb/M3.01 abertas. |

| 2026-10-11 | Codex | M3.01r concluída no preparo/verificação local:fonte9272dbd2084295e28ba23090dba45bd5280d3250/PR #25 criado/anexado | Qualidade114641137749/CI38196795022 success:1067 unitários/56 arquivos,43 scripts/check/build/sete páginas. Checkout4bd2b9d48132b70f8f0c9cc6231abe501c641509/pais main9a25+fonte conferidos, extrato901a25658093f19fe03164a3763793d716bbb73a799916e3d2b6a8b7cc561a59. 541 banco locais/24 próprios, advisors/read-back e duas revisões sem bloqueador. Geral remota/e2e114641137499 vivo, PR rascunho/head preservado; fechamento documental local não reinicia CI. Próxima S; resolução/liberação e P/I/parentb/M3.01 continuam abertas. |

| 2026-10-11 | Codex | Iniciada M3.01s após R verificada; branch feat/resolucao-cobrancas/preflight OK | Root único escritor, revisores somente leitura. Prova deve ser explícita e ligada a protocolo/start/receiptN, sem aceitar ausência/zero/404. Journal/replay/terminal/liberação exata/auditoria atômicos, claim intacto e snapshots históricos sem campos novos. CI38196795022/PR #25 vivo/head9272 preservado. Escopo local fictício aprovado mantido. |

| 2026-10-12 | Codex | CI38196795022/PR #25 integralmente aprovado na fonte9272dbd2084295e28ba23090dba45bd5280d3250 | Log real e2e114641137499 confirma541 banco/30 arquivos,167 navegador/sete omissões planejadas e dois advisors sem achados. Checkout4bd2b9d48132b70f8f0c9cc6231abe501c641509/pais main9a25+fonte/head conferidos; extrato64b1d9eff28a91bee173a567c5e013092f3f6dec0d204bfcf05dfbdaf266ae2b. PR pronto para revisão/fonte preservada, sem merge/publicação. |

| 2026-10-12 | Codex | M3.01s implementada localmente em0065/0066/0067; prova, terminal e fronteiras de retomada corrigidas | 35 novos unitários/1102 gerais/57 arquivos e43 scripts passam no check préfinal; build local encontra restrição Turbopack já conhecida. 49 banco próprios passaram; ensaio adicional determinístico da retirada antesN em execução. Suíte geral pré0067 reproduziu duas falhas reais de histórico em outro escopo (581passed/2failed);0067 corrige guardas globais e protege retirada/N antesfaults, sem mudar replay. Advisors após cada migration sem achados; duas revisões somente leitura sem bloqueador. Geral/fontefinal/checkCI pendentes; P/I ainda abertas. |

| 2026-10-12 | Codex | M3.01j desdobrada antes do código em t/u/v, conservando escopo integral | Revisão somente leitura inventariou somas divergentes nos consumidores e necessidade de chargeback comprovado/prova adicional, observação independente, posição cumulativa sem dupla contagem, resolução financeira separada de S e compatibilidade dos snapshots. Nenhum código de J implementado nesta etapa; parent fica aberto até as três partes e jornada verificadas. |

| 2026-10-12 | Codex | M3.01s suíte geral final/advisors/read-back aprovados; preparação da fonte | 591 banco/31 arquivos com50 próprios,35 novos unitários/1102 gerais/57 arquivos e43 scripts. Banco34ccdf4c2a87bf279da8c5353712420f0fccdf9283df409f4ecfee07a0dd0add; advisors segurança/desempenho sem achados após cada migration e final97540f3494191882bfdb34e0ce0f4c388fadcbcc74d8eb41200ead6110c07daa. Read-back67 migrations/25 públicas/45 privadas comRLS/quatro perfis/markerfalse e zero metadata/fatos/journals de pagamentos (5e1eeadac04ec27c77641e9d9e3d86d610182c26dd1378524d4e86672d76da42). Check final local falha só no build por porta internaTurbopack, extratobef3f5c214a7306352b8e7199339d51c8c4f8824a16063b46351b272070d3792. Duas revisões sem bloqueador; fontefinal/CI pendentes, P/I/parentb/M3.01 abertos. |

| 2026-10-12 | Codex | Fonte S924a17102ae1e608ea14c574b0fe258871d85849/PR #26 criada e anexada | Preflight/identidade GitHub fabioalmeidadigital/repo1414349093/origin/main9a25 conferidos. CI38199725409 iniciado; PR rascunho e head preservado durante execução. Código local limpo no envio; fechamento documental posterior somente local, sem reiniciar CI. Check/build final pendente; P/I/parentb/M3.01 abertas. |

| 2026-10-12 | Codex | M3.01s e parentsP/I concluídas no preparo/verificação local; fonte924a17102ae1e608ea14c574b0fe258871d85849/PR #26 criado/anexado | Qualidade114650224889/CI38199725409 success:1102 unitários/57 arquivos,43 scripts/check/build/sete páginas. Checkoutb9cf72fc0e427ae97d54e0749532be6af39c8714/pais main9a25+fonte conferidos; extratod0751ef0111d5cd148aecfcad5faae3b6df82732703fcfb42cdeb2d8c3bd615e. 591 banco locais/50 próprios,advisors/read-back e duas revisões sem bloqueador. E2e114650225077 vivo,PR rascunho/head preservado; fechamento documental local não reinicia CI. Próxima T,parte de Jdesdobrada previamenteemT/U/V; parentb/M3.01/condições externas abertas. |

- **2026-10-12 - revisão M3.01w:** cobertura do journal T preparada por fingerprint canônico com multiplicidade, sem backfill; crédito disponível fica desconhecido diante de consulta pendente/falha/fonte ainda não considerada/conflito, preservando valor observado. Replay e fonte antiga conservam posição; conflito durável retira candidato. Devolução ajustada usa apenas bruto histórico comprovado. Testes próprios passaram; regressão geral encontrou contagem de tabelas T que foi delimitada ao recorte original. Proteção contra same stale após UNKNOWN em verificação; nenhuma aplicação/efeito financeiro externo. X/V seguem obrigatórias.

- **2026-10-12 - M3.01w verificação local:** migrations0074–0077 aplicadas apenas no banco local;51 unitários próprios/1189 gerais em60 arquivos e43 scripts aprovados. 653 gerais/33 arquivos até0076 e63 focados finais após0077 (33 W+30 T) passaram. Teste real de dois processos reproduziu leitura divergente antes de0077 e passou depois; fonte/fingerprint/revisões compartilham snapshot. Banco `3262a684e40afab4e962330507d7a74b6dfb6dd43f328d70fe7b99e2847f377a`; foco `546de18d3d55057d7740e0f2dc5fa4c67fd6651de9076016403d8b564966c78b`; reprodução `e41cb33081651421067d925846134fc0de41d0df79a8f7f84b5012c65279ea9c`. Advisors finais sem achados `97540f3494191882bfdb34e0ce0f4c388fadcbcc74d8eb41200ead6110c07daa`; read-back77 migrations/25 públicas/51 privadas comRLS/4 perfis/markerfalse, metadados vazios e pagamento base do seed preservado `afa31d9f7dc7a5defc25c25031f0ad6abcb59207a14705868e75b7dbedfd0e0d`. Duas revisões sem bloqueador. Build local ainda EPERM de porta/Turbopack, log `d6ca8b4a573a863b46851523240629e339813b17da646d2e7664f216ebf58c69`; check/build da fonte final no CI pendente. W permanece parcial até essa confirmação, X/U/J/V e condições externas continuam abertas. Nenhuma publicação/ops real.

- **2026-10-12 - fonte M3.01w enviada:** commit303b47757364d2d98f441324547672d4d7115ca8/PR #28 criado e anexado. Identidade GitHub fabioalmeidadigital/repositório público1414349093/remote/autoria/main9a25 conferidos; worktree limpa no envio. CI38205949733 iniciado; rascunho/head congelado durante a execução. Check/build final pendente; W/U/X/J/V/parentb/M3.01 continuam abertos. Nenhuma alteração cloud/MCP/publicação ou operação real; fechamento documental posterior somente local.

- **2026-10-12 - M3.01w concluída no preparo/verificação local:** fonte303b47757364d2d98f441324547672d4d7115ca8/PR #28 criado/anexado. Qualidade114669363566/CI38205949733 success:1189 unitários/60 arquivos,43 scripts/check/build/sete páginas. Checkouta1a7589ccebbe9a89500e0ddf25f841a9fe989fc/pais main9a25+fonte/head confirmados, extrato388b55e78fbeebd6667b83cd89c99fa640c63a93887c109ff2cbad0912f15493. 653 gerais locais até0076 e63 focados finais após0077,33 próprios de banco e51 unitários próprios; snapshot concorrente reproduzido antes e corrigido depois. Advisors/read-back e revisões sem bloqueador. E2e114669363491 vivo,PR rascunho/head congelado; fechamento documental só local não reinicia CI. Próxima X; U/J/V/parentb/M3.01/condições externas e objetivo integral permanecem abertos. Nenhuma operação real/cloud/publicação nova.

- **2026-10-12 - início M3.01x/y:** retomada na fonte documental3b2d35a, worktree limpa e preflight aprovado; branch feat/aplicacao-creditos. X desdobrada antes do código em y/z/aa pela fronteira aplicação/efeitos versus terminal/proteção dos writers versus origem de legado/jornada integral. Nenhuma exigência removida. CI28 vivo/fonte303b477 preservada. Root único escritor; revisões somente leitura. Apenas dados/banco locais, sem cloud/MCP/operações reais/publicação.

- **2026-10-12 - CI integral M3.01w:** CI38205949733 success na fonte303b47757364d2d98f441324547672d4d7115ca8/PR #28:654 banco/33 arquivos,167 navegador/sete omissões planejadas e dois advisors sem achados. Checkouta1a7589ccebbe9a89500e0ddf25f841a9fe989fc/pais main9a25+fonte/head verificados; extratod703b0cd2b882c6f948993f34a318b1bc2bc3141451861d4912cf6afa04ed32a. Fonte preservada; documentação segue na nova branch Y, sem reiniciar CI anterior ou publicar.

- **2026-10-12 - M3.01y verificação local:** aplicação financeira transacional preparada em0078–0084 apenas no banco local.36 banco próprios finais,688 gerais até0082,1195 unitários/60 arquivos e43 scripts;14 browser375/1440 comAxe/capturas/QA e repetições de preferência/timeline aprovadas. Revisões sem bloqueador,advisors/read-back sem achados/resíduo do ensaio;84 migrations/25 públicas/52 privadas comRLS,4 perfis,markerfalse e pagamento original do seed preservado pending. Build local EPERM de porta/Turbopack; check/build da fonte final no CI pendente. Y/X/U/J/V/parentb abertas; reserva/run intactos,Z/AA obrigatórias. Nenhuma publicação/cloud/operação real.

- **2026-10-12 - fonte/CI M3.01y:** fonte55164faa3a207e8abb98ead7da56365f63d53238 enviada ao PR #29 criado/anexado; identidadefabioalmeidadigital/repositório público1414349093/remote/autoria/main9a25 conferidos. Check/build CI38210168644/job114682336319 success:1195 unitários/60 arquivos,43 scripts e sete páginas; checkoutc4a075e6ff06caf9cb1c3f729b3ed2cf1ce7ccda/pais main9a25+fonte/head conferidos,extrato025ff6d574afdba09b0500c754fd5c860246b94501117583e01b5a47697b7425. 688 gerais locais até0082 e36 próprios finais após0084,14 navegador375/1440 comAxe/capturas/QA,advisors/read-back e duas revisões sem bloqueador. Y concluída no preparo/verificação local. Suíte geral remota viva; fonte congelada,fechamento documental somente local. Próxima Z; X/AA/U/J/V/parentb/M3.01 e objetivo integral permanecem abertos. Nenhuma cloud/publicação/operação real.

- **2026-10-12 - início M3.01z/ab:** retomada na fonte documental e801d93, worktree limpa e preflight aprovado; branch feat/guardas-financeiras. Z desdobrada antes do código em ab/ac, por envolver guardas de múltiplos writers antes de qualquer terminal/liberação e posterior evolução de views/jornada. Nenhum requisito removido; AA/V seguem obrigatórias. CI29/source55164fa vivo/head preservado. Root único escritor, revisões somente leitura; dados/banco locais fictícios, sem cloud/publicação/operação real.
| 2026-10-12 | Codex | M3.01z dividida antes do código em ab/ac sem retirar escopo. AB preparada com projeção comum e locks;0085 aplicada localmente/advisors sem achados.27 casos próprios aprovados; erro de escala decimal e contato nas fixtures corrigidos. Corrida N corrigida com releitura do receipt depois de locks/advisory; duas revisões SQL por leitura sem bloqueador | Regressão geral/check/CI e read-back pendentes;AC/AA/V e parents abertos;sem cloud/publicação/operação real |
| 2026-10-12 | Codex | CI38210168644 da aplicação Y integralmente success na fonte55164faa3a207e8abb98ead7da56365f63d53238:690 banco/34 arquivos,179 navegador/sete omissões e advisors sem achados. Checkoutc4a075e6ff06caf9cb1c3f729b3ed2cf1ce7ccda/pais/head conferidos;extrato01adbb88001efe4ef1ac0d803fad9bc7434c76b5566d22c1548a450e52d627f8 preservado em ci-integral | FontePR #29 preservada;Z/AC/AA/V e parents continuam abertos |
| 2026-10-12 | Codex | AB:primeiro geral35 arquivos/717 casos:714 aprovados e três expectativas antigas de legado=0. W/AB já conservavam crédito desconhecido nulo;expectativas corrigidas sem alterar SQL e revalidadas com46 focados/2 arquivos aprovados.1196 unitários/60 arquivos e43 scripts;build local segue EPERM/Turbopack | Geral final e CI da fonte em verificação;0085 sem novo DDL;AC/AA/V e parents abertos |
| 2026-10-12 | Codex | AB concluída no preparo/verificação local:fonteadbb50618a395a268e352e33ae14c7f1a49b122c/PR #30;717 banco/35 arquivos e46 focados/27 próprios. Check/build CI38213748801/job114693572820 success,1196 unitários/60 arquivos,43 scripts/sete páginas;checkout44c376c59014febbd3143a66a5be76d42809a105/pais/head conferidos. Advisors após0085/final sem achados;read-back85 migrations/25 públicas/52 privadas RLS,4 perfis/markerfalse/metadatazero e seed12500pending preservado. Dois revisores SQL por leitura sem bloqueador | PróximaAC;Z/X/AA/U/J/V/parentb/M3.01 abertos;CI geral vivo/PR rascunho/head congelado;sem cloud/nova publicação/operação real |
| 2026-10-12 | Codex | CI38213748801 das guardas AB integralmente success na fonteadbb50618a395a268e352e33ae14c7f1a49b122c:717 banco/35 arquivos,179 navegador/sete omissões e advisors sem achados. Checkout44c376c59014febbd3143a66a5be76d42809a105/pais/head conferidos;extratoeaf4086288d4530bfa68aa69ea63b8e6dfdb1a8a65ee8d03118e386c8d13aa0a preservado | AB fonte preservada;AC ainda em verificação/parents abertos |
| 2026-10-12 | Codex | AC preparada:SQL86 journal/IDs/fences/origem/terminal/delete exato,views atuais separadas de S/v1 e retomada.19 próprios aprovados após87 corrigir referência local do motivo detectada por42P01;30 próprios finais incluindo recuperação em outro processo,workers atrasados,reserva/claim posteriores sob refund-CB-UNKNOWN,rollback e concorrência.1237 unitários/61 arquivos e43 scripts;advisors após86/87 sem achados;tipos/lint verdes;build local EPERM/Turbopack | Geral final/CI/read-back ainda em execução;AC/Z/AA/V e parents continuam abertos;sem cloud/publicação/operações reais |

| 2026-10-12 | Codex | AC: regressão geral747/36 e repetição final30/1 aprovadas;asserções de claim antigo e same acrescentadas após revisão independente. Advisors finais sem achados,read-back87 migrations/25 públicas/53 privadas comRLS e seed preservado. Views históricas/S intactas,claims/reserva posterior protegidos | Fonte preparada para PR/CI;AC/Z/AA/V/parents continuam abertos até confirmação do check/build da fonte;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | AC/Z concluídas no preparo/verificação local com fonte f611607/PR31;check/build exatos do CI38219444567 aprovados,checkout/pais/head conferidos.747 banco locais,30 próprios finais,1237 unitários/61 arquivos/43 scripts,advisors/read-back íntegros. AA dividida antes do código emAD/AE após três revisões por leitura,conservando origem/writer e jornada integral | CI integral remoto ainda vivo/head preservado;próximaAD;AA/X/U/J/V/parentb/M3.01 abertos;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | InícioAD emfeat/origem-legado,base773f98b/worktree limpa. Preparação por três revisões somente leitura: produtor explícitoT/N/R,vínculo porIDs,imutabilidade da linha e fila apósY sem aviso financeiro duplicado. Limpeza administrativa local será separada do caminho PostgREST por session_user e marker | PR31/head f611607 preservado comCI integral vivo;AD/AE/AA e parents abertos;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | AD preparada comSQL0088 local/advisors sem achados,produtor/vínculo explícitos eimutabilidade,47 próprios/1284 unitários/62 arquivos/43 scripts aprovados.34 banco ampliados passaram após corrigir preparações dos ensaios,sem mudança naSQL aplicada.36 finais em execução;históricos/duascontas/Rfind/saldo/grants/session_user/fila-rollback verificados no ensaio anterior | Geral/CI/read-back pendentes;AD/AE/AA/parents abertos,PR31/head preservado eCI integral vivo;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | PR31/CI38219444567 integralmente aprovado:747 banco/36 arquivos,179 navegador/sete omissões planejadas,advisors sem achados. Fonte f611607/head/checkout/pais conferidos;extrato094b2513dfcfd3343c1a25cbbc642d25964c15a4ca1fcb985a30087b1180efa9. AD passou36 finais,incluindo auditoria/fila/aviso rollback eT durante espera com alocação pendente,sem SQL nova | GeralAD em execução;AD/AE/AA eparents abertos;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | AD concluída no preparo/verificação local,fontefe55a63/PR32.783 banco/37 arquivos,36 próprios finais,1284 unitários/62 arquivos/43 scripts;check/build remoto exato aprovado,checkout/pais/head conferidos. Advisors finais sem achados,read-back88 migrations/25 públicas/55 privadas comRLS,4 perfis/markerfalse/seed íntegro/metadados vazios | CI integral remoto ainda vivo/head preservado;próximaAE;AA/X/U/J/V/parents abertos;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | InícioAE emfeat/jornada-legado,base87d6ddf/worktree limpa epreflight aprovado. Preparação por três revisões por leitura;mantido protocolo integral AA/Y/Z/legado e telas375/1440 comupload/download realauditado. Consumidores monetários eafter_balance continuam emV,sem recibo manual para mascarar pendência | PR32/head fe55a63/CI38223644784 vivo e preservado;AE/AA/X/U/J/V/parents abertos;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | CI32 inicial38223644784 falhou emum fence por timeout5000ms,782 demais banco passaram. Prazo localizado30000ms,36 retestados efonte a818eef publicada somente emfeat/origem-legado;CI38227632215 qualidade/check/build exatos aprovados,integral vivo/head congelado. AE passou15 novos ensaios reais de banco,com W tardio,reserva posterior,bind/AC/Y/manual e rollback conjunto;UI em diagnóstico | AE/AA/X/U/J/V/parents abertas;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | AD/PR32 correçãoa818eef integralmente aprovada noCI38227632215:783 banco/179 navegador/sete omissões/advisors sem achados,fonte/checkout/pais/head conferidos. AE preparada com15 próprios/798 gerais banco,seis navegador375/1440/30 capturasQA+dois retakes,controles restaurados exatamente/read-back/advisors sem achados;1284 unitários/62 arquivos/43 scripts aprovados | Check/build dafonteAE final pendente/EPERM local;AE/AA/X/U/V/J/parents abertas;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | AE/AA/X/U concluídas no preparo/verificação local,fonte e792553/PR33. CI38232179008/job114754059279 check/build exatos aprovados:1284 unitários/62 arquivos/43 scripts,sete páginas;checkout/pais/head conferidos.798 banco/38 arquivos,seis navegador375/1440/30 capturasQA+dois retakes,controle/seed restaurados exatamente/read-back88/25/55RLS/advisors sem achados | CI integral remoto vivo/PRdraft/head preservado;próximaV com preparação por leitura de quatro frentes;J/parentb/M3.01/condições externas abertas;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | InícioV/AF emfeat/leituras-credito,base56fc906/worktree limpa epreflight aprovado. Preparação por três revisões somente leitura efrontend-design;V dividida antes do código emAF leituras/DTOs,AG contrato-upload,AH entrega/bytes eAI jornada,sem reduzir escopo | PR33/head e792553/CI38232179008 integral confirmado vivo e preservado;AF/V/J/parents abertas;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | AF parcial: schema de crédito extraído para módulo puro, com UUID normalizado preservado; rascunho SQL0089 ainda não aplicado e sob revisão. Typecheck e 51 testes focados aprovados; npm run check aprovou formato/lint/tipos, 1284 unitários em62 arquivos e43 testes de scripts | Build local conserva falha EPERM de porta/Turbopack, registrada em.data/revisao/af-check-inicial.log. DTOs/consumidores/banco/navegador e fonte final deAF pendentes; tarefa permanece aberta, sem commit de entrega nem operação externa. Consulta atual doCI38232179008 retornou success na fonte e792553; extratos detalhados ainda devem ser conferidos antes do fechamento documental doPR33 |

| 2026-10-12 | Codex | CI integral de AE/PR33 confirmado:798 banco/38 arquivos,185 navegador/sete omissões e dois advisors sem achados;fonte e792553/checkout9c05a10/pais/head conferidos. Artefatos e hashes preservados;PR33 pronta para revisão,sem alterar a fonte | AF implementada localmente em0089/DTOs/UI;31 banco focados/15 próprios,14 navegador/seis próprios em375/1440/Axe/24 capturasQA e1293 unitários/43 scripts aprovados. Regressões gerais/extra de saldo/read-back/fontefinal/CI deAF pendentes;build local conserva EPERM;nenhuma cloud/publicação/operação real |

| 2026-10-12 | Codex | AF implementada/verificada localmente:SQL0089,16 próprios/814 gerais de banco em39 arquivos,9 novos/1293 unitários em63 arquivos e43 scripts.14+10 navegador375/1440/Axe,24 capturasQA,advisors/read-back89/25/55RLS/metadados vazios/quatro perfis/seed econtroles restaurados | Fontefinal/check-build remoto pendentes;build local EPERM de porta/Turbopack,sem contorno. AF permanece parcial;AG/AH/AI/V/J/parents eoperações externas abertas;nenhuma cloud/publicação/operação real |

| 2026-10-12 | Codex | Fonte final deAF b77a8c880e4a9ff1a8e74f5669c53b7b146301bc enviada aoPR34 criado/anexado. Conta fabioalmeidadigital/repositório público1414349093/remote/autoria/branch eworktree limpa conferidos;git diff main --check aprovado | CI38248514809 confirmado in_progress na fonte exata;PRdraft/head congelado. 814 banco/16 próprios,1293 unitários/43 scripts,14+10 navegador/Axe/QA/advisors/read-back aprovados;AF parcial atécheck-build remoto,AG/AH/AI/V/J/parents abertas;nenhuma cloud/publicação/operação real |

| 2026-10-12 | Codex | AF concluída no preparo/verificação local na fonte b77a8c880e4a9ff1a8e74f5669c53b7b146301bc/PR34 criada eanexada. Check/build CI38248514809/job114808421161 success:1293 unitários/63 arquivos,43 scripts e sete páginas;checkout e9d9a21f688186ef9c29c2fe8f7ab18c521d8fca/pais main9a25+fonte/head conferidos,extrato02bbe85f36baf274331dc026e8a4eeccf373d28ad807a305c040fe7ba19ca4d7 |814 banco/39 arquivos/16 próprios,14+10 navegador375/1440/Axe/24 capturasQA,advisors e read-back89/25/55RLS/controles restaurados. Suíte geral remota viva,PRdraft/head congelado;fechamento documental só local não reiniciaCI. PróximaAG;AH/AI/V/J/parents eobjetivo integral abertos,sem cloud/publicação/operação real |

| 2026-10-12 | Codex | InícioAG na feat/credito-contrato-upload a partir da9b942,worktree limpa/preflight aprovado;AF concluída localmente eCI34 vivo/fonte b77a8c8 preservada | Leitura de0041/0060/0078/0085 confirma soma histórica na retirada decontrato e ausência delocks decharges/queries/positions antes do arquivo. Preparação preserva RF34,recibos/replay/reservas e ausência deretrocesso de trabalho ativo;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | AG preparada emSQL0090 apenas localmente;18 próprios/53 focados e dez navegador375/1440/Axe/dez capturasQA aprovados. Ensaios ampliados incluem rollback,arquivo compartilhado,contrato/Y e troca real de dono;identidade final isolada passou após respeitar unicidade/provisionamento e restauração |22 próprios/836 gerais em execução;read-back/advisors finais/fonte/checkCI pendentes.1293 unitários/43 scripts passam,build local EPERM. AG permanece parcial;AH/AI/V/J/parents abertos;CI34 vivo/head preservado;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | AG verificada localmente:22 próprios/836 gerais banco em40 arquivos;10 navegador375/1440/Axe/dez capturasQA,1293 unitários/63 arquivos/43 scripts. Advisors após0090 e finais sem achados;read-back90/25/55RLS/quatro perfis/markerfalse/seed econtroles restaurados,identidade egrant temporários removidos |Fontefinal/check-build remoto pendentes;build local EPERM/Turbopack. AG parcial atéa confirmação;AH/AI/V/J/parents e objetivo integral abertos;CI34 vivo/fonte b77a8c8 preservada;nenhuma cloud/publicação/operação real |

| 2026-10-12 | Codex | AG concluída no preparo/verificação local:fonte d25fed7/PR35,check/build CI38253724198/job114826278059 success,checkout/pais/head conferidos,1293 unitários/43 scripts/sete páginas.836 banco/22 próprios,10 navegador/Axe/dez capturasQA/advisors/read-back/controles aprovados |CI34 cancelado aoexceder45min:814 banco aprovado,expectativa financeira antiga emdelivery-history e clique em confirmação hoje ausente nopayment-reservation causaram falhas/ação90s eleases presos nos retries. CI35 cancelado voluntariamente antes derepetir casos conhecidos. AJ adicionada antes do código,AF reaberta para sua regressão geral;AG/AH/AI/V/J/parents/objetivo integral não confundidos com CI completo;sem cloud/publicação/operação real |

| 2026-10-12 | Codex | AJ iniciada na fix/regressoes-consumidores-financeiros antes da escrita. Histórico sem aceite exige conciliação/pix ausente,preservando61 registros/paginação/cursor/microssegundos. Reserva criada após render mantém prova do servidor/reenvio com bytes/UUID/payload só emmemória;reload verifica confirmação ausente/aviso atual. Ações limitadas a10s/liberação de fila emfinally |Ensaios focados375/1440 e geral pendentes;AF/AJ/V/J/parents abertas. AG preparada/verificada localmente na fonte d25fed7;CI35 cancelamento solicitado porregressões herdadas,sem declaração deCI geral. Nenhuma cloud/publicação/operação real |

| 2026-10-12 | Codex | AJ foco aprovado:14 navegador375/1440,incluindo histórico/reserva eaceite;reenvio daação mantém mesmos bytes/UUID/payload emmemória e reload não apresenta confirmação ativa. Suíte completa iniciada sem reduzir casos,jobCLI18239/logaj-navegador-integral.log |Geral local ainda em execução;check/build final/read-back/advisors/QA/fonteCI pendentes. CI34cancelled45min com814 banco aprovados;CI35cancelled voluntário confirmado. AF/AJ/V/J/parents eobjetivo integral abertos;nenhuma cloud/publicação/operação real |

| 2026-10-12 | Codex | AJ suíte integral local executada:187 navegador aprovados/sete omissões planejadas/quatro falhas,exclusivamente consulta Mailpit emcadastro/recuperação/jornada. Históricos/reservas corrigidos passaram emambos viewports. Diagnóstico local seguro:API200,total251 com busca vazia/messages_count0;e busca deumdestinatário temtotal251/messages_count1 |A guarda antiga comparava totalGlobal a100. Escopo AJ ajustado antes do código para limitar resultados da busca epreservar caixa compartilhada;nenhuma limpeza global,relaxamento deauth ou omissão de casos. Geral/check/read-back/advisors/fonteCI ainda pendentes;objetivo integral ativo |

| 2026-10-12 | Codex | AJ busca Mailpit corrigida pela contagem da consulta,comparser puro deaté100 resultados completos/offset0/IDs únicos e destinatário exato;caixa global preservada. Dez unitários próprios/1303 gerais em64 arquivos,lint/tipos e quatro navegador deauth/cadastro/jornada375/1440 aprovados,duas omissões planejadas | Suíte geral local final iniciada sem reduzir casos;read-back/advisors/check/build/fonteCI ainda pendentes. Histórico61/regressão de reserva comreenvio permanecem cobertos. Nenhuma alteração deAuth/SMTP/Asaas/cloud/publicação real |

| 2026-10-12 | Codex | AJ geral local passou191 navegador/sete omissões previstas. Check passa1303 unitários/64 arquivos/43 scripts,lint/tipos/formato;build mantém EPERM de porta internaTurbopack. Advisors finais semachados |Read-back90/25/55RLS/quatro perfis/markerfalse/pagamento1/identidades restaurados;controles divergiram somente emquatro arquivos uploaded doensaio files.spec semfinally. AK adicionada antes do código eobrigatória paraAJ;repetição geral eCI ainda pendentes,sem declaração deambiente limpo |

| 2026-10-12 | Codex | AK limpeza específica de download implementada emfinally comnome UUID/processo seed/pasta case echecagem destorage/auditoria/metadados. Quatro resíduos identificados removidos,comausência deobjeto e auditoria comprovada. Ensaio preserva307/URL120s/bytes/hash/acesso cruzado/Axe eprovoca erro ao final para comprovar limpeza |Três navegador375/1440 aprovados euma omissão prevista;controles após foco idênticos aAG. Suíte completa final iniciada na CLI10276,sem reduzircasos nem ampliar45min;AJ/AK aguardamcheck/read-back/advisors/fonteCI eAF/AH/AI/V/J/parents/objetivo integral permanecem abertos |

| 2026-10-12 | Codex | Revisão AK identificou emSQL0090 evento file_uploaded comdata.file_id. Limpeza será restrita também aesse evento dafixture,no mesmo helper para upload300MB/download;sem apagar histórico global deprocesso ou recuperar IDs desconhecidos deexecuções antigas |Especificação ajustada antes do código;suíte191/7 emexecução usa a primeira versão dohelper,refino final terá foco próprio eCI integral obrigatório parafonte exata |

| 2026-10-12 | Codex | AJ/AK preparo local final verificado:191 gerais/sete omissões,14 focadosAJ/quatro auth-jornada e três finaisAK/uma omissão;1303 unitários/64 arquivos/43 scripts,formato/lint/tipos passam. Read-back90/25/55RLS/quatro perfis/markerfalse/seed/controles idênticos aAG,advisors semachados/leases liberados/12 capturasQA |Refino final deeventos/upload300MB posterior a191 tem foco próprio aprovado;fonte completa final deve passarCI integral. Build localEPERM/Turbopack registrado. AF/AJ/AK/AH/AI/V/J/parents/objetivo integral abertos;nenhuma cloud/publicação/operação real |

| 2026-10-12 | Codex | Fonte AJ/AK e2342ce4d8ec54c6a6e86b965327b09bea44e011 commitada e publicada somente na fix/regressoes-consumidores-financeiros;conta fabioalmeidadigital/repo público ID1414349093/autoria/main9a25 conferidos. PR36 criado draft/anexado,head remoto idêntico;CI38262322935 emexecução |Read-back/advisors/controles/leases/evidências locais verificados;check/build/CI integral final ainda pendentes. Cabeça preservada até resultado;AF/AJ/AK/AH/AI/V/J/parents/objetivo integral abertos. Sem merge/main/deploy/cloud/operação comercial |

| 2026-10-12 | Codex | PR36 draft/fonte e2342ce4d8ec54c6a6e86b965327b09bea44e011 comcheck/build success confirmado pelaAPI/job114855699883/CI38262322935;conta/repoID/head corretos. Evidência ci36-qualidade.json comcontadores locais1303/64/43 separados doreporte remoto |Job114855699700 emexecução detestes debanco;gh run view recusa disponibilizar logs enquanto runalive,extratos/checkout ainda pendentes. Geral integral ainda obrigatória paraAF/AJ/AK antes deAH/AI/V/J/parents. Fonte remota congelada,commit documental só local para não reiniciarCI;objetivo integral ativo |

| 2026-10-12 | Codex | CI38262322935/job114855699700 confirmado vivo emtestes debanco;qualidade114855699883 success,sem reiniciar aexecução. Preparação deAH detalhada antes do código porfase/contrato/aceite/snapshot/locks/UI/bytes,sem mudarD6. Diagnóstico local legado1passed/2skipped comprova saldo null mas quatro metadados liberados porsoma antiga |Nenhuma implementação deAH antecipada;AJ/AK/AF aguardamCI integral. Fonte remota e2342ce preservada;watchCLI13156 acompanha run existente. Leitura dos módulos identifica a próxima mudança necessária,sem backfill decontextos ou ativação real |

| 2026-10-12 | Codex | CI36 terminoucancelled por45min comtodos os testes verdes:836/40 banco,191/7 navegador22min,dois advisors;check/build1303/64/43/checkout c77966660e4634c556b2360e9c0d904c3686b846/pais conferidos peloextrato nativo. AL adicionada antes do código,fix/duracao-ci-qualidade basee556f06 |M3.14a corepreço/projeção empreparo foi preservado integralmente no stash7e1d735fbb905d09ceb948a27bf2d82f4e01ba71/feat/simulador-publico,27 regressões preço aprovadas;SQL0091 draft não aplicado. PrioridadeAL;nenhum dado/arquivo descartado,sem aumentarinfra/custo/pub/produção |

| 2026-10-12 | Codex | AL alterou somente timeout e2e45→60;app/supabase/scripts comárvores idênticas àfonte e2342ce quepassou836/40 banco,191/7 navegador e dois advisors. Formato/lint/tipos1303 unitários/64 arquivos/43 scripts reexecutados/aprovados;build localmantémEPERM |Nova fonte precisa CI integral paraencerramento/artefatos eantes deAF/AJ/AK/AH/AI/V/J/parents. PrototipoM3.14a preservado emstash7e1d735 semDDL aplicado;nenhuma outra etapa/caso/runner ou aplicação alterada |

| 2026-10-12 | Codex | Fonte AL81b7026c3ab1a8d0481bb3fe5afe537c26a26338 commitada/push somente fix/duracao-ci-qualidade,conta/repoID1414349093 corretos. PR37 draft criado/anexado/head confirmado;CI38269491889 emexecução comlimite60min |Core app/SQL/scripts idênticos a e2342ce;CI36 todos oschecks funcionais passarammascleanup cancelou,sem substituirconclusão geral porpassagem detestes. AF/AJ/AK/AL/AH/AI/V/J/parents/objetivo integral abertos. StashM3.14a7e1d735 intacto,SQL91 não aplicado;nenhummerge/deploy/cloud/produção alterado |

| 2026-10-12 | Codex | Check/build dafonte AL81b7026/PR37/CI38269491889/job114879935067 confirmado success pelaAPI,head/conta/repo corretos;job114879934662 vivo emtestes debanco. Novo orçamento60min apósprova36 de836/191/advisors verdes ecleanup fora45min |Fonte remota congelada;extratos nativos/checkout/encerramento geral ainda obrigatórios paraAL/AF/AJ/AK. M3.14a preservado nostash7e1d735,semSQL91 aplicado;AH/AI/V/J/parents/objetivo integral abertos. Nenhuma publication/merge/prod/cloud ou descarte realizado |
| 2026-10-12 | Codex | Banco doCI36 concluído comsuccess às14:44:31UTC (início14:24:22),navegador ativo;head e2342ce preservado/watchCLI13156. Tarefa independente M3.14a adicionada antes do código e iniciada nafeat/simulador-publico,base e556f06 limpa |Preparo local fictício do simulador segueM3.00;campos/preços/textos comerciais dependemAndré. AJ/AK/AF aguardam CI integral eAH não foi antecipada. Nenhuma publicação/conta/produção alterada |

| 2026-10-12 | Codex | M3.14a restaurada de stash7e1d735 nafeat/simulador-publico apósfast-forward30dd457;conflito doplan resolvido preservando statusCI37/AL e especificação/registro do simulador. Código novo sempublicação,SQL91 ainda nãoaplicado |CI37 confirmado vivo emtestes debanco/check-build success;head remoto81b7026 preservado. Nenhum código/stash descartado,preços e campos comerciais continuam pendentesAndré,AH aguardaAL/AJ |

| 2026-10-12 | Codex | M3.14a SQL0091 aplicado somente local,funcget_public_price_table comwhitelist/umativa real/STABLE/search_path vazio/RPC anônimo autorizado sem select detabela. Imutável apósaplicação;dois advisors semachados. Motorseparado depreço conserva calculateQuote,45 testes próprios/regressões preço passaram e tipos/lint aprovados após ajuste detipo no teste |UI comercial e demonstração montadas,sem promises deprazo/identificação privada/contratação;focoRLS/375-1440/Axe/QA/check/regressões/fonteCI pendentes. CI37 fonte81b7026 segueindependente embanco,extratos ainda aguardamencerramento;AH aguardaAL/AJ. Nenhuma nuvem/publicação/produção alterada |

| 2026-10-12 | Codex | CI37 integral success nafonte81b7026/PR37:1303/64/43/build,sete páginas,836/40 banco,191/7 navegador,dois advisors,cleanup/artifactupload concluídos. Checkoutd6ba5b9ddec1425f2c2918b6b82060e0bd54978e/pais main9a25+fonte/head/extratos nativos conferidos |AF/AJ/AK/AL fechadas somente nopreparo/verificação autorizado. AH/AI/V/J/parents eobjetivo integral abertos. M3.14a restaurada/emteste comSQL91 somente local,tabela/dados fictícios;nenhummerge/deploy/cloud/produção |

| 2026-10-12 | Codex | M3.14a oito navegador passaram funcional/Axe apóslabels explícitos,masQA identificou classes vazias/CSS módulos sem aplicação. DiagnósticoDOM mostroumain/formclass vazio/h1 17px/workspace block;carregadorTurbopack *.css→*.css églobal. Estilo adaptado aclasses prefixadas simulator-* como padrão do repo,sem mexer nobundler |Reexecução375/1440 inclui tamanho título e geometria duascolunas/empilhamento além deAxe.32 regressões dehome/demo/orçamento aprovadas;capturas finais/check/read-back/advisors/fonteCI pendentes. CI37 fechado/PR37ready,AH/AI/V/J/parents abertos |

| 2026-10-12 | Codex | M3.14a oito testes próprios estilizados/Axe/375-1440 e oito capturas finais conferidos,32 regressões/1321 unitários65arquivos/43 scripts/cinco banco aprovados. Check local passou até buildEPERM/Turbopack. Read-back91/25/55/RLS/controles financeiros e donos idênticos ao baseline90,preço/identificação restaurados,dois advisors finais semachados | Suíte geral local198 passaram,sete omissões,uma falha no feedback de preferência ainda Salvando ao limite5s. Diagnóstico conservou falha original e duas execuções isoladas passaram com feedback1334/1279ms no mesmo limite;instrumentação removida/teste original byte a byte preservado. Falha inicial arquivada,fonte final precisa check/build/CI geral. M3.14 comercial e objetivo integral abertos;nenhuma nuvem/publicação/produção |

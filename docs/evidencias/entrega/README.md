# Verificação local da entrega conferida

Ensaio de 2026-10-11 no Supabase local exclusivo do André. Todas as identidades, processos, arquivos e informações financeiras são fictícios. Não houve publicação nem envio de mensagem externa.

- `bash scripts/dev-env.sh npm run check`: formatação, lint, tipos, 269 unitários e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls`: 61 aprovados, incluindo seis cenários de entrega.
- `bash scripts/dev-env.sh npm run test:e2e -- --workers=4`: 75 aprovados; cinco ensaios únicos omitidos só no celular. Os dois cenários de entrega passaram em 375/1440 px, com axe e ausência de transbordamento horizontal.
- Migrations locais 0024–0026; SQL lint e advisors locais sem achados.
- Leitura final: 26 migrations, 24 tabelas públicas e duas internas com RLS; dados profissionais/aprovações legais vazios, regra de liberação pendente, zero preços ativos/processos/entregas temporários e papel calculista confirmado.

O calculista envia PDF do cálculo, PJC e parecer em PDF para Entregas pelo TUS existente, com confirmação do SHA-256 no servidor. DOCX/XLSX podem ser vinculados como complementos. O formulário exige arquivos distintos do processo/pedido correto, upload concluído, versão do PJe-Calc, mês no formato MM/AAAA e três confirmações explícitas: liquidação, CPF/CNPJ no PJC e revisão/assinatura/nome/CRC. Campos e chave da tentativa permanecem após erro; nome e CRC incompletos bloqueiam a confirmação.

A RPC revalida identidade, papel, estado `in_review`, metadados e integridade dentro da transação. Congela identificação profissional e versões/metadados dos arquivos; altera o pedido para `delivered`, registra evento/auditoria e enfileira o aviso `delivery_ready` conforme a preferência. O payload do aviso contém apenas IDs. Despacho real continua dependente de M2.28. Revisão humana e integridade do upload são verificações distintas: os ensaios não comprovam cálculo, conteúdo de PJC ou assinatura ICP-Brasil.

Ensaios SQL cobriram duas chamadas com a mesma chave, payload divergente, papéis indevidos, arquivo pendente/inconsistente/fora do processo ou pasta, checklist não booleano, mês/tipo incorreto e CRC ausente. Falhas não deixam entrega/evento/auditoria parciais. Dois pedidos disputando os mesmos arquivos produzem um único vencedor, sem deadlock. Um request novo não reconfirma pedido entregue. Reenvio da tentativa concluída retorna o recibo persistido mesmo após mudar configuração ou disponibilidade do arquivo; metadados, vínculo, versão e snapshot da entrega são imutáveis.

A confirmação da entrega foi separada da liberação de download, conforme RF-35/D6. Sem política aprovada, o cliente vê a confirmação e os nomes das versões, mas nenhum link nem bytes. Se definida, a política é capturada naquela entrega: mudar a configuração não libera retroativamente entregas antigas. `before_balance` libera; `after_balance` exige sinais/saldos confirmados suficientes para o total. Triagem, pendência, estorno e contrato não representam quitação. Pedido em revisão e arquivo não confirmado continuam bloqueados.

No navegador, o cliente recebeu 404 nas rotas de download e conteúdo antes da liberação. Após saldo confirmado, baixou o PDF exato por redirecionamento privado sem cache, com URL assinada de 120 segundos e uma auditoria `file_download`. Estorno bloqueou nova leitura; outro cliente continuou com 404. Um link já emitido pode funcionar até seu vencimento. Nenhum token/URL assinada foi salvo como evidência. Os arquivos de teste usam bytes de PDF inventado e PJC de transporte, sem assinatura ou conteúdo judicial real.

O resumo apresenta cinquenta entregas por página, com cursor por data/UUID e retorno às recentes. Dois ensaios adicionais de M2.26a (`tests/e2e/delivery-history.spec.ts`) passaram em 375/1440 px: todas as 61 entregas com empates exatos e diferença de um microssegundo foram recuperadas uma vez, pelo cliente e pelo painel. Cursor inválido recebe 404 e página vazia permite voltar ao início. São registros fictícios sem bytes/assinatura, usados somente para testar ordenação; não constituem confirmação de entregas reais. Axe e largura da página passaram.

Capturas finais conferidas da confirmação/download: [checklist no computador](checklist-computador.png), [checklist no celular](checklist-celular.png), [cliente aguardando no computador](cliente-pendente-computador.png), [cliente aguardando no celular](cliente-pendente-celular.png), [download liberado no computador](cliente-liberado-computador.png) e [download liberado no celular](cliente-liberado-celular.png).

O teste inicial revelou que a política escondia do calculista os metadados pendentes necessários ao TUS. A migration 0026 permite esses metadados ao calculista; rotas de conteúdo/download e a auditoria continuam exigindo upload confirmado. Os estilos e o formato do mês foram ajustados e as capturas finais verificadas.

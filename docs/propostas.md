# Propostas do checklist

A proposta é calculada com as respostas persistidas do checklist, a versão ativa de preços e as configurações profissionais. A intenção enviada pelo cliente contém somente pedido, revisão e UUID de tentativa. Ator, valores, CRC e datas são obtidos e conferidos no servidor.

## Pré-condições comerciais

O avaliador exige checklist completo, tabela ativa validada, identificação/CRC/contatos, condições, regra versionada para o período contratual, calendário do TRT e disponibilidade válida. A unidade dos cartões deve corresponder à unidade cobrada. Urgência aumenta o valor; não reduz automaticamente o prazo nem cria capacidade.

O carregador comercial bloqueia a emissão enquanto não houver fontes protegidas e confirmadas de calendário, período e disponibilidade. Esses dados não podem vir como aprovação do formulário. Quantidade de pedidos não permite inferir duração, agenda nem uma promessa de entrega. A integração de RF-22 deverá também reservar capacidade atomicamente para impedir que propostas concorrentes usem a mesma disponibilidade.

## Ensaio fictício

`ANDRE_QUOTE_FIXTURES=1` só habilita simulação junto de `ANDRE_LOCAL_TESTS=1`, API exatamente `http://127.0.0.1:54321` e ausência de `VERCEL_ENV`. É uma variável exclusiva do servidor; nenhum parâmetro HTTP a habilita. Os documentos exibem **Ensaio fictício - sem valor comercial**, não permitem aceite e não reservam agenda real. Nunca cadastre essa variável na Vercel.

Nesse ensaio, calendário e capacidade são inventados. O período conta meses civis tocados, incluindo frações, somente quando a demissão foi informada. Essa regra não é uma decisão comercial do André; não usa a data-base como término presumido. Identificação e preços também são fixtures temporárias, restauradas pelos testes.

O Playwright inicia o servidor com o opt-in fictício. Antes do ensaio, encerre um servidor dev comum já aberto: o Playwright não altera o ambiente de um processo existente. Alternativamente, inicie explicitamente o servidor fictício:

```sh
ANDRE_QUOTE_FIXTURES=1 bash scripts/dev-env.sh npm run dev -- --hostname 127.0.0.1
bash scripts/dev-env.sh npm run test:e2e -- tests/e2e/quotes.spec.ts tests/e2e/quote-pdf.spec.ts
```

## Persistência e recuperação

O número `ORC-AAAA-NNNN` usa contador anual transacional, no ano de São Paulo, sem truncar após 9999. Snapshot, recibo privado, evento, auditoria e estado do pedido são gravados na mesma transação. Uma revisão de checklist produz uma proposta inicial; reorçamentação terá seu próprio fluxo.

O replay reautoriza o proprietário e recupera a proposta original antes de consultar preço/configuração atual. O probe é somente leitura. Alterar dados profissionais ou desativar a tabela não reescreve a proposta. Falha de auditoria reverte também o contador e o estado. RPC de emissão é restrita a `service_role`; a action valida a sessão antes de usá-la.

Valores ficam em centavos. Sinal é metade arredondada para cima; saldo é o restante. Validade segue `civil-days-sp-v1`: de um a 365 dias civis, preservando a hora de São Paulo, para emissões a partir de 2020 (UTC-03). Não usa dias úteis. Prazo de entrega usa dias úteis e deve caber na capacidade e no prazo interno, com a folga processual registrada.

## Consulta e PDF

Cliente proprietário consulta `/app/orcamentos/[id]`; calculista consulta `/painel/orcamentos/[id]`. A pasta do processo aponta para a proposta. Retomar um rascunho já convertido abre sua proposta.

`GET /api/quotes/[id]/pdf` deriva somente do snapshot, exige sessão de cliente proprietário ou calculista e audita a solicitação. Outro cliente, admin operacional e visitante recebem 404. A resposta usa `private, no-store`, `no-referrer` e `nosniff`. Falha de renderização retorna 503 sem detalhes internos e permite repetir o download sem criar outra proposta.

O arquivo inclui responsável, CRC/categoria/contato, itens, total/sinal/saldo, validade, datas e condições. Fontes são locais. Rodapé estático e numeração ficam separados, sem `lineHeight` numérico: esta versão do renderizador reaplica o multiplicador ao repetir elementos entre páginas. Textos indivisíveis recebem quebras visuais sem alterar o snapshot.

## Aviso ao André

Cada inserção de proposta não simulada enfileira `quote_created` na mesma transação. A chave `quote:<UUID>:<canal>` evita duplicação; atualizar uma proposta ou repetir uma inserção já aplicada não cria outro aviso. Propostas com `is_simulation=true` ou snapshot `mode=fixture` não entram na fila, inclusive no fluxo fictício do checklist.

O destino vem dos contatos do serviço e do vínculo persistente do responsável com papel de calculista. E-mail começa ligado; WhatsApp exige preferência explícita. Sem vínculo, papel adequado ou contato, o canal não recebe o aviso. Ligar um canal depois não recupera propostas anteriores. Os locks do vínculo e das configurações mantêm as escolhas estáveis durante o enfileiramento.

O payload inclui somente identificadores da proposta/pedido/processo, número, código e caminho da pasta no painel. Não inclui nome do cliente, número CNJ, itens, condições ou arquivos. O alerta não exige aceite nem coloca o pedido na fila de trabalho. Uma falha ao gravar qualquer canal reverte também a proposta e os outros avisos. A entrega por provedores segue a configuração específica de e-mail/WhatsApp; a fila por si só não envia mensagens.

Os testes positivos deste gancho usam propostas legadas sintéticas com snapshot vazio, em pedidos exclusivos no banco local. Isso verifica a fila sem permitir snapshots comerciais pela RPC ou flexibilizar o CHECK. A emissão comercial continua dependente dos insumos protegidos de calendário, período e capacidade.

Aceite/recusa ficam desabilitados na simulação. A contratação e instruções de pagamento seguem seus casos de uso específicos; o andamento fica somente no `plan.md`.

# Porta fictícia do Asaas — 2026-10-11

A parte M3.01e prepara criação, consulta, busca e fatura no servidor. `createAsaasFixtureAdapter` exige uma porta injetada com `mode: "fixture"`; congela escopo/capacidades e informa `identityProof: "fixture_declared"`. Não há driver HTTP, autenticação, segredo, banco, rota pública ou efeito financeiro. O nome da prova impede confundir a declaração da fixture com validação da conta real.

## Pedidos e respostas

Cliente usa nome, documento textual, referência local estável e `notificationDisabled:true`; e-mail/celular são opcionais, com celular nacional. Documento preserva letras/zeros. Uma capacidade alfanumérica não confirmada bloqueia antes da chamada. A fixture pode declarar suporte apenas para ensaio; isso não certifica o provedor. [Cadastro](https://docs.asaas.com/reference/criar-novo-cliente).

Antes do POST da cobrança, um GET confere ID, documento, referência do cliente e notificações desativadas. O corpo da cobrança contém somente cliente, meio, valor, vencimento e referência. O valor sai como token numérico canônico por BigInt, sem divisão de centavos em ponto flutuante. Meio/vencimento/valor são confrontados com a resposta. Cartão hospedado usa `CREDIT_CARD` sem dados de cartão; nenhuma URL, callback, split, cabeçalho ou token arbitrário entra. [Criação](https://docs.asaas.com/reference/criar-nova-cobranca), [cartão hospedado](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito).

A supressão explícita importa porque notificações padrão ficam habilitadas e o sandbox pode enviar comunicação real. A porta desta entrega não envia qualquer pedido; ativação e destinatários dependem do ensaio autorizado futuro. [Notificações](https://docs.asaas.com/docs/notifications-overview), [padrões](https://docs.asaas.com/docs/default-notifications), [sandbox](https://docs.asaas.com/docs/faq-sandbox).

| Resultado da porta | Criação | Consulta |
| --- | --- | --- |
| Recusa explícita válida antes do despacho | `not_dispatched` | reconciliação |
| HTTP200 e corpo/vínculos coerentes | objeto criado observado | observação |
| Erro, exceção, perda, corpo/escopo divergente ou HTTP inesperado | `indeterminate` | reconciliação |

Na cobrança, `not_dispatched` também pode significar que a consulta prévia falhou: nenhum POST ocorreu, embora o GET tenha sido chamado. Exceções não são inspecionadas para adivinhar despacho nem devolver causa/dados privados. Cada invocação faz no máximo um POST, sem repetição interna. Isso não assegura unicidade entre invocações concorrentes. `externalReference` é um vínculo estável, não uma restrição única documentada; a intenção persistida e o controle concorrente pertencem a M3.01b. [Retries e idempotência](https://docs.asaas.com/docs/retries-e-idempot%C3%AAncia).

Busca de unicidade consulta `limit=2`, `offset=0`, filtrando referência/documento do cliente ou cliente/referência da cobrança, sem filtro de status. Somente envelope coerente/completo com um candidato retorna observação. Mais de um, `hasMore`, contadores divergentes, IDs duplicados ou registro fora do filtro exigem conciliação. Não se percorrem páginas para selecionar um registro arbitrário. Zero completo é `not_located`, nunca licença para repetir POST perdido. `404` também pode ocorrer com ID de outra conta; permanece indisponível. Contadores conservam lexemas antes da conversão, recusando frações/expoentes que um parser comum arredondaria. [Paginação](https://docs.asaas.com/reference/listagem-e-paginacao), [clientes](https://docs.asaas.com/reference/listar-clientes), [cobranças](https://docs.asaas.com/reference/listar-cobrancas), [HTTP](https://docs.asaas.com/reference/codigos-http-das-respostas).

Fatura requer ID, vínculo, vencimento e meio esperados; só disponibiliza URL de origem/caminho restritos do ambiente para cobrança `PENDING`, ativa, sem estorno/chargeback e com valor atual igual ao contratado. Observações parciais/excedentes continuam preservadas para M3.01f, mas seu link fica indisponível. A URL é privada e não deve ser logada. A autorização do proprietário pertence ao caso de uso futuro, antes de expor essa porta. Link/estado criado não confirmam pagamento.

## Verificação executada

`npm run check` passou em formato, lint, tipos, cobertura com732 unitários/49 arquivos e43 testes de scripts. As duas novas suítes acrescentam136 casos sobre transporte/listas; o conjunto Asaas contém271. Os testes incluem POST perdido seguido de busca vazia sem nova criação, falhas pré/pós-despacho, escopos divergentes, mínimo de campos, valor no limite seguro, capacidade alfanumérica, notificações, listas incompletas/duplicadas, contadores com perda lexical e faturas divergentes. Todos os dados são fictícios.

Duas revisões independentes por leitura identificaram e confirmaram a correção da fatura com valor atual divergente; nenhum bloqueador remanescente no recorte. O build local encontrou o EPERM conhecido da porta interna do Turbopack em CSS do PDF; a execução local não prova build aprovado. O resultado remoto está registrado abaixo.

Compatibilidade real de formatos, envelope completo da lista, URLs de sandbox, CNPJ alfanumérico, associação conta/credencial e limites do transporte antes de acumular bytes ainda exigem driver/ensaio de M3.01c. A verificação fictícia não substitui esses requisitos. Persistência, crédito, webhook e pagamentos reais permanecem fora desta entrega.

O mesmo código passou em `npm run check`/build remoto no [CI38182349916](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38182349916), job qualidade114597378029, fonte `58f61cf291295672e8fa5c75d0cd1fa4b35a6893` do [PR #17](https://github.com/Harmony-Digital/andre-calculos/pull/17): 732 unitários/49 arquivos,43 scripts e compilação/geração de páginas. Checkout `3d803ab3b5083348dc2dad0f7cbe8be19ff4ac25` confirmado pela API com pais main `9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd` e fonte58f61cf. Extrato sanitizado de validação SHA-256 `773a8f23183863245596367206e725d76190d06fdb56baef609747e04f76d526`. Head preservado enquanto a suíte geral de banco/navegador segue; esse registro não declara CI integral do PR #17.

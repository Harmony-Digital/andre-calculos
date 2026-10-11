# Contratos precisos do Asaas — 2026-10-11

M3.01d é a primeira parte do adaptador aprovado em M3.01a. Os módulos de `app/src/modules/payments/asaas/` importam `server-only` e preparam dados para as próximas partes; não executam operações financeiras.

O parser lê JSON textual antes de qualquer conversão numérica e conserva cada lexema em `JsonNumber` imutável. Chaves repetidas, inclusive escapes equivalentes, são recusadas. Objetos não herdam protótipo; orçamento de um MiB, profundidade32, dez mil nós e mil itens por array limita o processamento. O futuro transporte precisa aplicar o limite de bytes antes de acumular a resposta.

Moeda é convertida com BigInt, mantendo o limite de centavos inteiros seguros. Mais de duas casas, expoentes, strings monetárias, arredondamento implícito e valores fora do limite são recusados. O valor líquido aceita sinal explícito como fato separado; valores de cobrança/estorno permanecem positivos. A saída gera token JSON numérico com duas casas, sem divisão em ponto flutuante. Constantes BigInt são compatíveis com o target TypeScript existente.

Os contratos conferem cliente, documento, referência da obrigação, valor original, ID da consulta e escopo conta/ambiente. AccountId e WalletId possuem marcas de tipo distintas. A origem declarada `account.id` do evento é conferida contra o contexto; esse teste não autentica o emissor ou a conta. A documentação não comprovou equivalência entre carteira/IDs cadastrais e conta emissora. A associação real precisa ser verificada antes do driver externo. [Origem da conta nos webhooks](https://docs.asaas.com/changelog/identifica%C3%A7%C3%A3o-da-origem-da-conta-em-webhooks-v3), [walletId](https://docs.asaas.com/reference/recuperar-walletid).

CPF/CNPJ são texto, preservando zeros e letras. Nome segue3–200 pontos de código e celular segue o validador canônico do cadastro. CNPJ alfanumérico está aceito pelo domínio local; suporte real de `/customers` não foi confirmado nas fontes consultadas e exige verificação explícita no sandbox. Isso não autoriza apagar letras ou alterar o documento. [Cadastro do cliente](https://docs.asaas.com/reference/criar-novo-cliente).

Criação exige valor contratado exato. Observação permite parcial/excedente quando o provedor também informa o original correspondente, mantendo ambos separados. `netValue`, cada estorno/status e chargeback permanecem fatos distintos, sem calcular/aplicar crédito. Enums futuros são conservados para reconciliação. Ausência de refunds fica distinta de array vazio; estorno não substitui o original. Timestamps seguem os exemplos oficiais e permanecem texto identificado como do provedor; presença/formato devem ser comprovados no ensaio, sem presumir UTC. [Cobrança](https://docs.asaas.com/reference/criar-nova-cobranca), [eventos](https://docs.asaas.com/docs/webhook-para-cobrancas), [estornos](https://docs.asaas.com/docs/estornos).

Inputs recusam campos arbitrários/cartão. Projeções de respostas descartam cartão, contato, descrição, comprovantes e campos novos não usados. Fatura tem política interna de HTTPS/origem do ambiente/caminho restrito, sem credenciais/query/fragmento; compatibilidade ainda precisa do ensaio. Erros têm apenas código/mensagem fixos, sem causa, payload ou valor recebido. Documento e fatura privada retornados são dados somente servidor e não devem ser registrados em logs.

## Verificação executada

```sh
cd app
npm run test -- src/modules/payments/asaas
npm run test:coverage
npm run lint
npm run typecheck
npm run check
```

135 testes próprios/3 arquivos aprovados; conjunto final de596 unitários/47 arquivos aprovado. Formato/lint/tipos e43 testes de scripts passaram. Os ensaios incluem perda lexical que `JSON.parse` ocultaria, limites/duplicatas/protótipo, moedas exatas, documentos/DDD/nome Unicode, escopos divergentes, vínculos, dados ausentes/inválidos, parcial/excedente, múltiplos estornos, enums futuros, descarte de dados e URLs privadas divergentes. Duas revisões independentes por leitura não encontraram bloqueador no recorte atual.

`npm run check` local chegou ao build e encontrou o EPERM preexistente da porta interna do Turbopack em CSS do PDF; não é registro de build aprovado. A fonte nova ainda aguarda check/build remoto. Não houve driver, segredo, conexão autenticada Asaas, alteração de banco, confirmação de pagamento, envio, cobrança, migration na nuvem ou publicação. Adaptador/transporte e normalização financeira pertencem às partes M3.01e/f, com condições no plan.md.

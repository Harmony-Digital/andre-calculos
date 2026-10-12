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

`npm run check` local chegou ao build e encontrou o EPERM preexistente da porta interna do Turbopack em CSS do PDF; não é registro de build aprovado. O resultado remoto está registrado abaixo. Não houve driver, segredo, conexão autenticada Asaas, alteração de banco, confirmação de pagamento, envio, cobrança, migration na nuvem ou publicação. Adaptador/transporte e normalização financeira pertencem às partes M3.01e/f, com condições no plan.md.

O mesmo código passou no `npm run check`/build remoto do [CI38180969695](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38180969695), job qualidade114593253417, fonte `a2cb04a87e23ae85581d2eb7f42881dfc24b7dae`: 596 unitários/47 arquivos,43 scripts e compilação/geração de páginas. Checkout `0cb19ffdc2b7798582467a06d9629d637cc16d71` confirmado com pais main `9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd` e fontea2cb04a. Log de validação sanitizado SHA-256 `fa40a743571c83dfee8bb34007f73aaecd0db5911ba2ef3b1f834d200e236a5e`. Head do [PR #16](https://github.com/Harmony-Digital/andre-calculos/pull/16) confirmado/preservado e PR em rascunho; suíte geral remota ainda em execução, sem evidência de conclusão integral neste registro.

O [CI38180969695](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38180969695) terminou integralmente com success às22:57:01UTC: 384 banco/RLS em23 arquivos,165 navegador e sete omissões; advisors locais de segurança/desempenho retornaram sem achados. Job e2e114593253251 e qualidade114593253417/checkout/pais/head da fontea2cb04a conferidos. Extrato sanitizado do banco/navegador/advisors SHA-256 `f5d09836713b532caca09e53176cc88a06dfa34d5f7a655cebfaa5acd7d5c3d7`.

O reporter GitHub informa a contagem, sem títulos individuais. Uma revisão do código no head exato identificou sete `test.skip`, todos restritos ao projeto computador: cronHTTP, recuperação/link Mailpit, upload300MB retomável, PDF por intervalos acima4,5MB, PDF multipágina/condições longas, configuração profissional/preços e cadastro/consentimentos. Não se declara execução desses sete no celular. O PR #16 está pronto para revisão com fonte preservada; não houve merge/publicação.

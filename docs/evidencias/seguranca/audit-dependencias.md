# Auditoria de dependências — M2.35a

Leitura em 2026-10-11, depois de preparar os modelos de e-mail. `npm audit --json` identificou cinco registros altos ligados ao mesmo advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), sobre esgotamento de pilha no `braces` com padrões profundamente aninhados. O advisory afeta versões até 3.0.3 e não informa versão corrigida.

| Pacote no lock | Versão | Classificação no lock |
|---|---|---|
| eslint-config-next | 16.4.0 | dev |
| @next/eslint-plugin-next | 16.4.0 | dev |
| fast-glob | 3.3.1 | dev |
| micromatch | 4.0.8 | dev |
| braces | 3.0.3 | dev |

Os mesmos nomes e versões já existiam na fonte 51733913a6c501841abe3fa3ca49333ed42b4932, anterior à instalação de `react-email`. A instalação não alterou esses pacotes. Não foram encontrados imports desse caminho em `app/src` ou no renderizador de e-mail; isso é evidência de leitura, não prova do conteúdo do bundle publicado.

`npm audit --omit=dev --json` terminou com código zero e zero vulnerabilidades em todas as severidades. Esse resultado delimita somente as dependências de produção segundo o npm. O audit completo continua com o achado, e M2.35/M2.35a continuam abertos no plan.md.

A sugestão automática de trocar `eslint-config-next` por 14.2.35 é downgrade que exige mudança incompatível; não foi aplicada como correção. A [disputa registrada no advisory-database](https://github.com/github/advisory-database/pull/10132) não equivale a correção ou retirada oficial do advisory. Nenhum pacote, permissão ou configuração de publicação foi alterado para ocultar o resultado.

Os relatórios JSON locais ficam em `.data/revisao/modelos-email-audit.json` e `.data/revisao/modelos-email-audit-producao.json`, ignorados pelo Git. Não contêm dados de processo, cookies ou segredos. Encerramento exige correção compatível ou atualização oficial do advisory, verificação de alcance e validação de build/testes; não constitui a revisão integral exigida pela skill security-review.

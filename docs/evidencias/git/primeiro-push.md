# Primeiro push privado — M1.12

Em 2026-10-11, o primeiro push previsto no plano enviou a `main` para `Harmony-Digital/andre-calculos`, privado, com a conta `fabioalmeidadigital`. Antes do envio, o remoto estava vazio e a branch recebeu fast-forward de `feat/fundacao-portal`.

SHA confirmado pela API e por clone bare independente:

`cc34885848e694887e7da7be626e87d2e037118a`

O clone remoto contém 25 commits e não contém o caminho nem o blob do áudio em nenhuma referência alcançável. O arquivo local continua íntegro. O conteúdo publicado passou pelos testes locais descritos em [jornada local](../jornada-local/README.md).

A varredura prévia dos 25 commits/682 blobs não encontrou candidatos nos padrões de credenciais examinados. Referências `op://` e geração de chaves locais em runtime foram identificadas sem divulgar valores. Essa varredura não substitui a revisão de segurança do projeto.

## Primeira execução do CI

[Execução 38139370081](https://github.com/Harmony-Digital/andre-calculos-arquivo-privado-20261011/actions/runs/38139370081), evento `push`, mesmo SHA. Essa execução pertence ao ID antigo do repositório, depois renomeado e conservado privado. A [retirada da transcrição](retirada-transcricao.md) documenta a separação do histórico publicado.

Os jobs `qualidade` e `e2e` foram criados, mas recusados **antes de executar qualquer etapa**. As anotações do GitHub informam falha de cobrança recente ou necessidade de aumentar o limite de gastos. Não houve falha de teste observada, e essa execução não é evidência de CI aprovado.

O runner também avisou que `ubuntu-latest` migraria para Ubuntu 26 em 2026-10-19. O workflow passa a usar `ubuntu-24.04` explicitamente para conservar a base durante a entrega prevista em outubro.

## Proteção de main

A consulta e a tentativa de criar o ruleset retornaram a exigência de upgrade para habilitar a funcionalidade neste repositório privado. Não foi alterada cobrança nem privacidade.

O payload preparado em `.github/main-ruleset.json` exige PR e os contextos `qualidade`/`e2e`, vinculados ao app GitHub Actions (id 15368, conferido nos checks reais). Não permite bypass. Esse arquivo é uma configuração preparada; a API recusou aplicá-la.

Até a proteção poder ser habilitada, permanece a regra de processo: trabalho em branch, PR e CI aprovado antes do merge. Referência de formato: [API oficial de rulesets](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset).

Andamento e insumos necessários são registrados somente em `plan.md`.

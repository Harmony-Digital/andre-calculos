# Retirada do áudio do histórico Git — M1.10

Em 2026-10-11, Fábio autorizou explicitamente remover `PROJETO DO ANDRE THE ONE.m4a` do histórico Git antes do primeiro push, preservando o original nesta pasta.

O filtro foi executado em cópia bare temporária, sem checkout/reset do arquivo local. Foram conferidos 24 commits de `main`/`feat/fundacao-portal`: todos os arquivos restantes, autores, datas, mensagens e relações entre pais permanecem iguais. O [mapa de SHAs](historico-filtrado.tsv) permite relacionar as evidências antigas aos commits reescritos.

Também foi retirado somente esse caminho de duas árvores de snapshot `refs/codex/turn-diffs`, mantendo os outros arquivos. As referências foram trocadas atomicamente, com conferência dos SHAs anteriores; não houve GC nem force-push. A cópia temporária foi removida depois da operação.

## Integridade do original

- Tamanho antes/depois: **19.552.708 bytes**.
- SHA-256 antes/depois: `d688ec18ccd28596f78c7573afe9c08048a15b8ed0c6a9980d4d037c47b8808e`.
- O arquivo físico continua na pasta e `*.m4a` permanece ignorado.

## Read-back independente

```sh
git ls-files -- "PROJETO DO ANDRE THE ONE.m4a"
git log --all --format=%H -- "PROJETO DO ANDRE THE ONE.m4a"
git for-each-ref --format='%(refname)' refs/original refs/andre-audio-filter
git rev-list --objects --all
git check-ignore --no-index -- "PROJETO DO ANDRE THE ONE.m4a"
```

As três primeiras consultas estão vazias. O blob do áudio não aparece entre os objetos alcançáveis de nenhuma referência, e o ignore reconhece o arquivo. O checkout permaneceu limpo após a filtragem. Nenhum objeto de áudio será incluído no push das branches filtradas.

O preflight remoto anterior à operação confirmou `fabioalmeidadigital`, `Harmony-Digital/andre-calculos`, privado, sem referências remotas. Andamento do primeiro push somente em `plan.md`.

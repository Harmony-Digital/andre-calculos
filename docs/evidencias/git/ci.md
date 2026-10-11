# CI remoto e integração da fundação — M1.13 e M2.34

Em 2026-10-11, a [execução 38142154491](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38142154491), do [PR #1](https://github.com/Harmony-Digital/andre-calculos/pull/1), terminou com `success` no SHA `b7d4390ca522d3d127062f796acf5a9be5966787`.

Os checks reais `qualidade` e `e2e` pertencem ao GitHub Actions, app `15368`, e apontam para esse SHA. Ambos foram concluídos com sucesso:

| Job                            | Evidência                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qualidade`, ID `114478041813` | `npm ci` e `npm run check`; formato, lint, tipos, 340 testes unitários em 33 arquivos, doze testes de scripts e build aprovados                                                               |
| `e2e`, ID `114478041670`       | Supabase local iniciado; 142 testes de banco em dezesseis arquivos; 109 testes de navegador aprovados, sete omitidos somente no projeto celular; advisors de segurança/desempenho sem achados |

Os logs registraram o build compilado em 8,4 segundos, a suíte de navegador concluída em 13,3 minutos e `No issues found` para os dois advisors. O teste de jornada usa cliente e André em contextos separados e as larguras de 375/1440 px; as três preparações sintéticas e os bloqueios comerciais estão descritos em [jornada local](../../jornada-local.md).

O PR foi integrado pelas regras normais, sem bypass, no commit `f0f900740ed60cb5cd655ce414b8b342ea35b0d9`. A API confirmou o merge e o SHA da `main`; fetch independente e comparação dos IDs das árvores confirmaram que todos os arquivos integrados são idênticos aos arquivos do SHA verificado pelo CI.

Não foram usados segredos de produção, serviços de envio ou banco na nuvem. Os advisors desse ensaio são locais; a aplicação hospedada e a contratação comercial exigem as validações e insumos registrados no `plan.md`. O andamento permanece somente naquele arquivo.

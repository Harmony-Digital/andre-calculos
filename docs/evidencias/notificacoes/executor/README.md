# Ensaio do executor fictício — 2026-10-11

`processPending()` é uma rotina somente servidor que exige configuração explícita `mode: simulation` e banco local confirmado (`127.0.0.1:54321`, `ANDRE_LOCAL_TESTS=1`, sem `VERCEL_ENV`). Não há endpoint, cron ou adaptador externo. Ausência de modo não cria execução ou tentativa.

Migration0055, aplicada somente localmente, registra execuções privadas imutáveis de 1–25 posições. Cada runId vincula canal, limite, alvos opcionais e versão; os requestIds são gerados uma vez sob lock e persistidos. Alvos explícitos não fazem seleção global quando ausentes. A retomada recupera posições já registradas, sem trocá-las por outros avisos.

O executor consulta primeiro o recibo do núcleo. Na ausência dele, recupera o resultado fictício já persistido; um RPC revalida a reserva e grava o efeito na mesma transação quando necessário. Resultados pertencem à tentativa; aceitação fictícia é única por `notification:<UUID>` e hash do snapshot. Cancelamento/expiração conservam recibos automáticos; resultado histórico não renova a lease nem transforma um aviso bloqueado/cancelado em sucesso.

Se a resposta se perde depois de o transporte gravar, uma consulta sem efeito recupera o resultado conhecido. Sem comprovação, registra `unknown` e interrompe; consulta indisponível ou conclusão sem confirmação para a execução, que deve ser retomada com o mesmo runId. Nunca classifica erro bruto como falha repetível. Uma prova fictícia que aparece depois de o núcleo bloquear não libera o aviso automaticamente.

As contagens são o **resumo cumulativo da execução identificada por runId**. Repetir uma execução concluída retorna `accepted: 1` novamente sem uma nova aceitação; não somar respostas repetidas como novos envios. `accepted` significa aceitação simulada, sem comprovar entrega externa. Saída não contém IDs, destinatário, conteúdo ou erro bruto.

## Verificações reproduzíveis

```sh
bash scripts/dev-env.sh supabase migration up --local --workdir ..
bash scripts/dev-env.sh npm run test:rls -- tests/integration/notification-processor.test.ts
bash scripts/dev-env.sh npm run test:rls
bash scripts/dev-env.sh supabase db advisors --local --workdir .. --type security --level warn --fail-on error
bash scripts/dev-env.sh supabase db advisors --local --workdir .. --type performance --level warn --fail-on error
cd app
npm run check
```

Conjunto geral de 370 testes/22 arquivos no PostgreSQL local aprovado. Trinta ensaios próprios passaram: mesmo/diferentes runIds concorrentes; replay; resultados aceitos/repetíveis/rejeitados/incertos; cinco tentativas; respostas realmente perdidas após o RPC gravar; cancelamento antes/depois do efeito; expiração antes/depois da aceitação; hash divergente/rollback; limite real de 25 diante de 26 avisos; ausência de adaptador; parâmetros imutáveis; RLS/grants/imutabilidade e recusa de anônimo/pessoa autenticada. Interceptação da rede confirmou apenas o Supabase local durante o processamento, sem chamadas ou logs de conteúdo privado.

Quarenta e três testes unitários dos módulos de fila/executor passaram (27 adicionados nesta entrega); conjunto geral de 461 unitários/44 arquivos, 25 testes de scripts, formato/lint/tipos aprovados. Advisors locais de segurança/desempenho retornaram `No issues found`. O build local encontrou a restrição preexistente da porta interna do Turbopack (`EPERM`); não foi registrado como build aprovado.

Fixtures controlam cenários somente por triggers temporários do proprietário local, inacessíveis ao serviço. Tabelas privadas têm RLS e nenhuma permissão direta para anon/authenticated/service_role; RPCs conferem papel e concedem execução apenas ao sistema.

Destinatário, vínculo, público e preferências ainda exigem revalidação específica na integração real. Modelo/HTML renderizado não é congelado por este snapshot. Adaptadores reais, cron, credenciais, SMTP, nuvem e produção pertencem a tarefas e autorizações posteriores.

O mesmo código passou no `npm run check`/build remoto do [CI38174754842](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38174754842), job qualidade114574690764, fonte `85568bcd004d387ab216bba5c23a95fbef52962e`: 461 unitários/44 arquivos, 25 scripts e build Next.js16.4. Fonte remota do [PR #12](https://github.com/Harmony-Digital/andre-calculos/pull/12) conferida e preservada; suíte geral remota concluída com sucesso: 370 testes de banco/22 arquivos, 165 e2e/sete omissões planejadas e advisors de segurança/desempenho sem achados. Checkout447f99c42e34abff17f54ec1b7e98f455d645cf3 conferido com a fonte preservada; PR #12 pronto para revisão. Read-back depois do ensaio completo confirmou zero execuções, chamadas, aceites, reservas, recibos e triggers das fixtures. M1.51c/ativação e advisory/revisão integral M2.35a continuam abertos no plano.

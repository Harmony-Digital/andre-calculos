# Concorrência no percurso completo do webhook

Recorte de M3.01c3c2c. PostgreSQL, provedor e pessoas exclusivamente fictícios no ambiente local. O andamento canônico está no `plan.md`.

## O que a matriz verifica

- Seis duplas de workers: Pix, boleto e cartão nas fases sinal e saldo produzem um GET, uma aplicação, um recibo e os avisos correspondentes. O replay preserva recibo e histórico sem emitir outra cobrança.
- Dezesseis perdas de resposta: antes/depois da gravação de recepção, claim, registro de query e finalização, nas duas fases. Operação não emitida continua ausente; operação já gravada recupera o recibo. O GET durável é reaproveitado e não surge pagamento duplicado.
- Seis percursos de atualização: evento novo, consulta mais recente e reclaim, nas duas fases. Callback antigo não aplica crédito, enquanto o worker atual conclui o percurso. Reclaim troca worker/epoch sem repetir o GET.
- Quatro consumidores em espera real: confirmação manual do sinal, autorização de arquivo e conclusão de fatura de sinal/saldo. O teste observa o waiter bloqueado pelo holder específico em `pg_stat_activity`; não usa atraso arbitrário como prova da concorrência.

O sinal manual parte de recebimento integral e estorno parcial confirmados pelo próprio worker: crédito de 11.500 centavos, residual de 1.001 e reserva naturalmente encerrada. Um novo envelope dos mesmos fatos invalida o saldo lido enquanto o comando espera o pedido. A tentativa é recusada sem pagamento ou recibo; depois de processar a fila, a mesma solicitação confirma os 1.001 centavos uma vez. Nenhuma reserva é removida para fabricar elegibilidade.

O arquivo parte de sinal/saldo recebidos, entrega explicitamente fictícia e política aprovada pelo calculista fictício através do comando existente. Um evento novo enquanto a autorização espera o cliente bloqueia o acesso e conserva a ausência de auditoria indevida. Esse ensaio verifica RLS e autorização de metadados; a transferência de bytes continua na verificação de telas de C3c3.

A fatura é capturada por GET antes da espera. O evento pendente torna seu contexto obsoleto; a conclusão recusa o link anterior em ambas as fases e o worker atual recebe o crédito normalmente.

## Recursos e fontes

O produtor e o worker são os de C3c2a. Não há origem ou binding legado alimentando o crédito. O pagamento manual só nasce do comando explícito do calculista, depois da recusa e do processamento do webhook; não é preparo financeiro paralelo.

Holders têm timeout do PostgreSQL, rollback e encerramento do processo próprio. Limpeza do holder e da solicitação pendente é independente e preserva a falha principal, com relatório somente dos nomes dos recursos. Interceptações de resposta são restauradas antes da limpeza das fixtures. Evidências não contêm payloads, cookies, headers, tokens ou contatos.

## Ensaios iniciais

Os 28 percursos de workers/perdas/atualizações passaram em 70,75 segundos. Os quatro consumidores em espera passaram em 10,69 segundos; os outros 28 foram omitidos deliberadamente nessa execução focada. Logs e hashes estão em `fronteiras.*` e `consumidores.*`. Esses resultados não substituem a matriz final conjunta, a regressão geral nem o check/build da fonte final.

## Matriz final conjunta

Os32 casos passaram em79,08s/exit0. Read-back/controles/grants finais idênticos ao baseline106/25/61RLS/4perfis/markerfalse; dois advisors sem achados. Formato/lint/tipos1494unidades75arquivos e43scripts passaram. Build local impedido pela restrição EPERM de porta interna; check/build da fonte final e regressão geral mantêm comprovações próprias. Provas em `verificacao-foco.json` e arquivos associados. Nenhuma regra da aplicação ou migration foi alterada.

O check/build da fonte2792f93 foi aprovado no CI38346971121/job115130522542. Prova exata em `ci62-build.json`: artefato11789536886, checkout8c2d7724, pais main9a25+fonte, árvore, lock/config e inventário sanitizado conferidos. App/SQL/scripts/workflow locais ainda correspondem à fonte congelada. A regressão geral local e a integral remota conservam resultados próprios.

## Regressão geral da fonte final

A fonte2792f93 terminou com1.135 testes aprovados em55 arquivos/1.371,17s/exit0, incluindo32 próprios e as partes a/b anteriores. Read-back/controles/grants finais idênticos ao foco; dois advisors finais sem achados. App, SQL, scripts eworkflow corresponderam à fonte congelada durante a execução. Evidências em `regressao-geral.json` e arquivos associados; execução integral remota e percursos nas telas mantêm comprovação própria.

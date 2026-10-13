# Tempos e ciclo de limpeza das preferências

Evidências de M2.35g; andamento canônico no `plan.md`.

O CI61 da fonte8f4212a falhou primeiro porque a mensagem de E-mail/Nova mensagem estava vazia no limite5s. O diagnóstico posterior registrou HTTP200, resposta terminada, recibo, revisão1 e mensagem de sucesso aos5110ms; a captura original mostra `Preferência salva.`. Outros casos falharam adquirindo o lock de settings ou por timeout. O artefato11791757053,386 PNG e o recorte/hash original foram conferidos. Isso comprova os sintomas, sem identificar a etapa que reteve o recurso nem a causa do atraso.

O diagnóstico agora registra tempos relativos de início/resposta/fim de POST e até16 transições do formulário. Cada estado contém apenas pending/revisão/opção/sucesso e comparação booleana da tentativa. A primeira confirmação nova exige ausência de pending e mudança do nonce; uma mensagem da tentativa anterior não é tratada como sucesso novo. Os observadores usam apenas o formulário e os IDs ficam em memória. Não se exportam IDs, cookies, headers, contatos, HTML ou payload. Cleanup registra início/fim/falha de cada recurso preservando a ordem e o erro.

Dois controles finais passaram em3,7s, nas duas larguras: resposta concluída antes da atualização da tela, confirmação nova/antiga, privacidade, página fechada e erro de cleanup preservado com próximo recurso executado. O teste original passou duas vezes em1,4min; a execução final conserva5000ms/90000ms, asserções e zero retries. Nas duas larguras, routes/context/session/process/fixture terminaram e o banco/controles voltaram ao baseline106; locks de settings/fila ausentes e dois advisors sem achados.

Formato/lint/tipos,1494 unitários em75 arquivos e43 scripts passaram. Build local encontrou a restrição EPERM da porta interna do Turbopack; check/build da fonte exata requer prova no CI. Nenhum componente, função de negócio, limite ou operação de cleanup foi alterado. A falha original ainda não foi reproduzida com sua causa; as tarefas f/g permanecem abertas e esta instrumentação não é apresentada como correção causal.

# Driver do webhook para os ensaios das telas

Recorte de M3.01c3c3a: processo Node/TSX separado, com condição `react-server` e protocolo fechado de IPC. Nenhum endpoint de teste foi criado na aplicação. O andamento canônico está no `plan.md`.

O driver usa `webhookFinancialJourneyFixture` de sinal e os mesmos receptor, worker, obrigação, reserva, produtor e captura já verificados no banco. Depois de uma entrega confirmada, cria o target de saldo no mesmo pedido/processo. Os helpers antigos permanecem intactos. A preparação de saldo conserva suas etapas e UUID para reenvio; não gera outro POST quando já está pronta.

As mensagens validam identificador, ação e cenário; os metadados de partida também são validados. Saída contém somente IDs/estados fictícios. Erros internos, ambiente, cookies, headers, tokens e contatos não são encaminhados. O runner aceita fechar repetidamente e restaura as fixtures e o ambiente antes do ACK. Um comando de entrega sintética existe apenas no modo explícito de ensaio do driver, sendo recusado no modo destinado às telas.

## Verificação

Cinco casos finais passaram em12,87s/exit0: Pix/boleto/cartão com sinal e saldo recebidos pelo worker, recusa de saldo antes da entrega, preparação de saldo repetida sem outro POST, crédito total de25.001 centavos, replay sem novo efeito, evento pendente/UNKNOWN/recuperação e fechamento repetido. Comandos inválidos e preparo sintético fora do modo de ensaio foram recusados sem interromper o processo. Meio inválido foi recusado antes de abrir processo.

Os primeiros ensaios tiveram2pass/3falhas no encerramento. O diagnóstico do mesmo fluxo confirmou `code:null` e `signal:SIGTERM`: o controlador interrompia o filho depois de já receber confirmação de limpeza. O driver passou a esperar saída natural nesse caso, exigindo ACK `closed` e exit0; conservou o limite de15 segundos e a interrupção para falhas de partida. Logs anteriores e hashes foram preservados.

Read-back, controles e grants finais são idênticos ao baseline106/25/61RLS/4perfis/markerfalse; dois advisors sem achados. Formato/lint/tipos,1.494 unidades em75 arquivos e43 scripts passaram. Build local impedido por EPERM na porta interna do Turbopack; a fonte exata precisa do check/build no CI. Provas em `verificacao-local.json` e arquivos associados.

Estes casos verificam o driver. Eles não demonstram as telas nem a transferência de bytes pelo navegador: isso permanece nas partes b/c/d. No modo de telas, revisão, entrega e política são confirmadas pelos comandos do produto com pessoas e documentos fictícios.

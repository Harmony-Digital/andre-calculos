# Evidências de M3.01ab — guardas financeiras locais

Recorte autorizado: dados fictícios e PostgreSQL local deste projeto. A alteração usa a projeção comum W antes de novos pagamentos; não chama Asaas nem envia mensagens reais. Estado da entrega, fonte, contagens finais e próximas tarefas ficam somente em `plan.md`.

## Crédito e compatibilidade

O preview de obrigação conserva o shape v1. Crédito conhecido satisfaz sinal ou reduz o restante; excesso conserva seu valor e bloqueia a emissão. Posição ausente, consulta aberta, UNKNOWN, fonte ainda não aplicada, conciliação e legado sem origem explícita deixam o crédito disponível nulo. O motivo `financial_reconciliation` diferencia essa situação de um valor conhecido igual a zero.

Manual, preparo G, reserva, início de execução e último limite N compartilham locks de domínio, pagamentos, charges ordenadas, consultas e posições. O sinal coberto pelo provedor não gera recibo manual atribuído ao calculista. Uma reserva própria ainda permite o primeiro despacho quando o contexto continua vigente. Mudança depois do início bloqueia N antes de consumir falha simulada, gravar receipt ou produzir efeito; claim e reserva permanecem protegidos.

Recibos existentes continuam sendo snapshots históricos. O replay recupera o resultado original antes de reavaliar a dívida atual; um request novo não pode reutilizar contexto obsoleto. O produtor N anterior fica privado e sem EXECUTE para papéis da aplicação. Seu wrapper público exclusivo de serviço relê o receipt sob o advisory lock depois da espera por locks de domínio, preservando um replay que surgiu durante a espera.

## Concorrência real

Os testes usam duas conexões PostgreSQL, com espera confirmada por `pg_blocking_pids`, sem depender de sleep:

- Primeiro POST N gravado pela transação bloqueadora e crédito alterado antes do commit: a chamada concorrente retorna o receipt original. Há uma criação e uma invocação de replay, sem pagamento duplicado.
- Y aplica o recebimento enquanto o manual aguarda o cliente: após o commit, o manual recusa com `Sinal recebido pelo provedor`, comprovando que releu a posição conhecida.
- Somente a charge está travada enquanto o manual tenta completar um parcial. T abre uma consulta antes do commit: o manual aguarda o lock financeiro e depois recusa por incerteza, sem recibo ou Pix novo.

## Ensaios e limites

O arquivo próprio verifica pagamento conhecido, parcial, excesso, devolução parcial/integral, saldo, seis estados de incerteza, contexto antigo, replay manual/G/reserva/N, primeiro create, mudança entre claim/start/N e privilégios. A regressão completa exercita os contratos históricos e os demais writers. Advisors e leitura final do banco conferem permissões e limpeza dos dados do ensaio.

Alguns testes removem diretamente a própria reserva como preparação fictícia, para provar que a nova guarda funciona sem o bloqueio antigo. Essa preparação não constitui implementação de resolução. AB não altera terminal, não libera reserva e não encerra run; esses efeitos pertencem a AC. Origem explícita do legado e integração completa dos consumidores permanecem em AA e V.

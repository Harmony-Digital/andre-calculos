# Evidências de M3.01ac — terminal financeiro local

Recorte autorizado: dados fictícios e PostgreSQL local deste projeto. O caso de sistema recebe somente IDs da aplicação Y e da solicitação de resolução. Não chama Asaas nem despacha mensagens reais. Estado da entrega, fonte, contagens finais e próximos passos ficam somente em `plan.md`.

## Prova e transação

O journal financeiro é privado, imutável e separado da resolução S de não despacho. A origem exige aplicação, cobrança, execução, pagamento selecionado, contexto bruto, binding e expectativa coerentes. Recebimento deixa a obrigação satisfeita; por isso a resolução confere autoridade histórica sem exigir que o preview antigo continue pronto para cobrar.

Antes de criar um terminal, a transação exige posição conhecida, candidato W, captura corrente, nenhuma consulta aberta ou conflito, além da correspondência das revisões da posição e da cobrança e do fingerprint do journal. `same` antigo com fences coincidentes não prova captura atual. Parcial, disputa, pendência, UNKNOWN e fonte obsoleta conservam a proteção.

Sob os locks comuns de AB/Y/T, a execução própria recebe motivo financeiro, incremento de revisão e `current_step` nulo. O comando remove exatamente sua própria reserva, preserva o claim e grava journal e auditoria na mesma transação. Zero inesperado ou reserva de outra intenção falha fechado. Não repete crédito, aviso ou evento econômico já aplicado por Y.

O recibo original é recuperado antes de reavaliar cobertura, reserva, configuração ou marker, e relido sob advisory depois da espera por locks. Outra aplicação não pode reutilizar a solicitação. As views atuais validam o terminal pelo journal e pela origem histórica, sem depender do crédito depois de um estorno.

## Históricos e workers

Os schemas dos recibos S, reserva/retirada, contexto G e aplicação Y permanecem históricos. A view atual de execução admite terminal financeiro em contrato separado; a intenção atual conserva sua revisão própria igual a dois. Retomada reconhece o journal financeiro antes de alocar outro passo.

Claim terminal retorna sem etapa. Start/prepare atrasados são recusados e finish pode conservar observação tardia sem mudar o terminal. N recupera recibos antigos e recusa criação nova antes de consumir falha simulada, mesmo diante de uma reserva reinserida na preparação negativa local.

## Ensaios

Os testes verificam recebimento/devolução integral, parcial/disputa/pendência, quatro formas de perda de cobertura, `same` antigo, recuperação por consulta equivalente, replay e IDs divergentes, ausência/reserva diferente, rollback explícito e falha da transação depois da liberação, resoluções concorrentes e retomada em outro processo.

Também percorrem workers atrasados, snapshots v1/Y intactos, concorrência com confirmação manual, espera comprovada por lock de charge e recibo criado durante a espera. Depois do terminal antigo, uma cobrança de saldo no mesmo pedido recebe sua própria reserva e claim; devolução, chargeback e UNKNOWN antigos atualizam a posição sem alterar essa nova proteção. A consulta do cliente distingue crédito do sinal e saldo ainda sem posição aplicada.

Advisors, leitura final do banco, comandos, hashes, fonte e resultados do CI são registrados após verificação. AA e V continuam necessárias para origem explícita do legado e integração completa dos consumidores; esta parte não decide D5/D6 nem ativa pagamentos reais.

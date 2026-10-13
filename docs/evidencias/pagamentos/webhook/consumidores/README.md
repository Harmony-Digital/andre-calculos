# Consumidores do crédito recebido pelo webhook

Recorte de M3.01c3c2b: PostgreSQL e usuários locais fictícios. O andamento canônico está no `plan.md`.

## Percurso e expectativas

O produtor, a obrigação, a reserva, o receptor e o worker são os mesmos de C3c2a. Não há pagamento público, origem legada ou binding adicional alimentando o crédito. A fase de saldo começa com sinal recebido pelo próprio worker e entrega explicitamente fictícia.

O pedido custa 25.001 centavos: sinal de 12.501 e saldo de 12.500. Os valores esperados são constantes do ensaio, independentes da projeção consultada.

Os 33 casos desta matriz verificam:

- Pix, boleto e cartão no sinal: cliente e calculista leem o mesmo crédito; documento mínimo confirmado pelo comando libera a fila uma vez; hash divergente ou pasta de triagem não a liberam. O replay conserva recibo, eventos financeiros e avisos.
- Pix, boleto e cartão no saldo: pagar não aprova D6; a aprovação explícita pelo calculista fictício usa o comando existente. Estado de revisão bloqueia o cliente mesmo com pagamento integral. RLS e autorização do arquivo concordam com o contexto atual.
- Dez estados por fase: parcial, excesso, estorno parcial/integral/pendente, UNKNOWN, disputa de chargeback, débito e restauração parcial/integral. Os casos de chargeback usam cartão. Leitores de sinal/saldo, fatura e acesso acompanham os valores atuais. Cada nova entrega fictícia recebe sua própria política, preservando a regra imutável da anterior.
- Contrato explícito: o comando auditado permite fila com documento mesmo em conciliação, sem transformar incerteza em dinheiro recebido. O recibo é recuperado no replay.
- Outro cliente e administrador: fatura, crédito, contexto da entrega e autorização do arquivo continuam recusados após pagamento recebido.
- Redução de valor integral sem estorno: conciliação permanece explícita nas duas fases, sem fila ou autorização indevida; recibo anterior preservado.
- Simulação e ausência de contexto contratual: aceite recusado, proposta continua sem contratação e evento com referência de outro pedido fica em quarentena. Não surge charge, entrega ou aceite para essa proposta.

Estas verificações de arquivo cobrem metadados, RLS e o comando de autorização no banco. Não demonstram a transferência de bytes pelo navegador. C3c3 conserva essa verificação nas telas, em 375/1440 pixels.

## Ajustes dos ensaios iniciais

Os logs e hashes foram preservados. A primeira consulta nova ordenava recibos por `id`, enquanto a chave real é `quote_id`; seis casos falharam antes das asserções funcionais. Em seguida, três preparos de arquivo tinham uploader diferente do ator; a proteção de autoria os recusou.

Dois casos de pagamento parcial estavam preparados como recebimento integral seguido de redução sem estorno. A aplicação manteve conciliação corretamente. O parcial passou a ser a primeira observação e a redução sem estorno foi mantida como um caso negativo separado nas duas fases.

Na matriz de 33 casos, 32 passaram; o restante conservou `awaiting_payment` depois de um sinal parcial e documento confirmado. A expectativa foi corrigida para RF-34, incluindo residual de 2.501 centavos e reserva ativa. Nenhuma dessas correções alterou aplicação ou migrations.

## Resultado do foco final

Os 33 casos passaram em 88,31 segundos, exit0. Read-back, controles e grants finais são idênticos ao baseline106/25/61RLS/4perfis/markerfalse, com journals próprios restaurados; dois advisors sem achados. Formato/lint/tipos, 1.494 unidades em 75 arquivos e 43 testes de scripts passaram. Build local impedido pela mesma restrição EPERM de porta interna; check/build da nova fonte e regressão geral são verificações próprias, ainda sem conclusão neste foco. Provas e hashes em `verificacao-foco.json`.

O check/build da fonte8f4212a passou no CI38343908798/job115120821592. Prova exata em `ci61-build.json`: artefato11788032042, checkout4826511a, pais, árvore, lock/config e inventário conferidos. A regressão geral continua sendo uma verificação própria.

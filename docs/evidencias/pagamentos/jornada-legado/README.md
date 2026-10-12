# Evidências de M3.01ae — jornada do legado fictício

Os ensaios usam exclusivamente PostgreSQL, provedor e contas fictícias locais. Resultados finais e pendências ficam somente no `plan.md`.

## Jornada financeira

A mesma cobrança percorre execução R, captura/consulta T, aplicação Y, origem explícita AD, vínculo e terminal AC. Crédito parcial, excesso e taxa são comparados em centavos. Refund preserva o histórico cumulativo de valores efetivamente devolvidos; a devolução integral usa o bruto recebido, inclusive quando inferior ao contratado. Chargeback efetivo, reversão, disputa, UNKNOWN e conflito conservam a origem sem repetir recebimento.

As barreiras PostgreSQL usam `FOR NO KEY UPDATE`, permitindo os inserts N/T com FK enquanto writers aguardam. A contagem recursiva inclui esperas indiretas. Intercalações vínculo/AC nas duas ordens, Y durante espera de vínculo, T/Y durante espera de AC/manual e rollback conjunto conferem posição, três fences, journals/auditorias, fila e aviso únicos. Recibos originais são recuperados sem repetir efeitos.

Nos movimentos tardios, uma reserva posterior, seu claim, run e POST são criados pelo protocolo real da fixture. Devolução, chargeback e UNKNOWN da cobrança antiga alteram apenas sua posição/efeitos; as duas proteções e os recibos históricos permanecem íntegros.

## Navegador e isolamento

Node/TSX mantém um único lease settings→fila durante o navegador, sem endpoint de teste na aplicação. A guarda exige o ambiente local e URL loopback. O protocolo nunca transmite o ambiente, senhas, tokens ou erros RPC. Encerramento aguarda a limpeza e explicita eventual interrupção não confirmada.

Cliente e calculista percorrem a pasta em 375/1440 px. Upload real confere hash/bytes e satisfaz RF34; o parcial continua fora da fila. Eventos financeiros são produzidos pelos casos de uso, com autoria de sistema e filtro da timeline. A preferência financeira começa com aviso efetivamente criado e é alterada na interface; afeta somente novos avisos do canal escolhido, enquanto cliente, movimento e auditoria permanecem. Replay não repete aviso.

A entrega usa os três arquivos enviados pela interface e o checklist técnico fictício. Sem regra aprovada, não há links/bytes. Uma aprovação fictícia `before_balance` da própria entrega permite download com token de 120 s, `no-store`, comparação dos bytes e auditoria por arquivo/autor. Cliente B não lê processo, conteúdo nem download. O aceite comercial e os dados técnicos do contrato são pré-condições sintéticas dos helpers; os ensaios não afirmam autoria real nem validade profissional dos arquivos.

## Limite da validação

A migração dos consumidores monetários para W e a integração financeira de `before_balance`/`after_balance` pertencem a V. Esta jornada exercita os contratos de leitura/liberação existentes e uma política fictícia explícita; não substitui saldo com pagamento manual nem aprova D5/D6. Provedor real, banco cloud, produção, publicação e despacho a pessoas reais ficam fora destes ensaios.

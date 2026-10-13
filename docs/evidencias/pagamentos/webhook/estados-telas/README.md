# Matriz financeira do webhook nas telas

Evidências de M3.01c3c3c1. O andamento canônico está no `plan.md`.

A matriz tem 66 percursos independentes: onze estados de sinal, onze de saldo sob liberação antes do pagamento e onze sob liberação depois do pagamento, em 375/1440 px. Pix cobre os fatos de recebimento/estorno; cartão cobre os chargebacks. Os três meios nominais já têm evidência própria no recorte b.

Os estados são parcial, excesso, estorno parcial/integral/pendente, disputa, débito, restauração parcial/integral de chargeback, UNKNOWN e redução do recebido sem estorno. Cada positivo confirma upload, etapas, revisão, entrega e regra individual pelos comandos da UI. Sinal parcial continua fora da fila. Não há entrega técnica, D6 ou pagamento público semeados. O driver recebeu apenas `signalReplay`, que distingue a charge do sinal do target ativo de saldo; cinco ensaios de driver passaram em14,62s.

Oráculos fixos em centavos conferem as duas visões, subtotal observado separado de crédito disponível, taxa100 sem abatimento, fatura atual, links/bytes/autorização e auditoria, preservação dos snapshots técnicos e regra aprovada. Reenvio compara também o histórico visível, além de eventos/avisos no banco. UNKNOWN e estorno pendente têm recuperação pela consulta e worker existentes.

## Evidência das correções do teste

A primeira matriz terminou com42pass/24falhas em11,9min, sem retries. Houve duas expectativas erradas no ensaio: exigir instrução de saldo dentro do registro de uma entrega `before_balance`, embora sua dívida continue na fatura; e esperar que uma redução sem estorno substituísse o subtotal admitido. Três reproduções com as mesmas asserções e diagnóstico limitado a números/estados confirmaram posição `reconcile`, último subtotal de12501/12500 e nenhum crédito disponível. O teste passou a exigir esses valores e a ausência do bloco de cobrança na entrega antes do saldo, conservando a prova da dívida na fatura.

A verificação adicional de replay comparou inicialmente `innerText` com o `textContent` padrão do matcher: seis falhas preservadas mostram o mesmo conteúdo com diferença de quebras de linha. O matcher passou a usar `useInnerText:true`, mantendo igualdade integral, limite5s e zero retries. Os seis focos finais passaram em1,1min, com26 capturas/Axe/largura, bytes/auditoria e snapshots preservados. O resultado da matriz completa na fonte final tem comprovação própria; o foco não o substitui.

Read-back/controles/grants do foco são idênticos ao baseline106/25/61RLS/4perfis/fixturefalse/pagamento manual original12500pending; dois advisors sem achados. Formato/lint/tipos,1494unidades75arquivos e43scripts passaram após remover um import de tipo não utilizado; a primeira falha de lint foi preservada. Build local permanece impedido por EPERM na porta interna do Turbopack, requerendo check/build da fonte exata no CI. Produto, SQL, helpers financeiros antigos, scripts e workflow não foram alterados.

Logs anteriores, diagnóstico e hashes foram conservados. O manifesto de capturas usa o algoritmo local de diretório do Playwright e foi conferido com o foco real; não foi necessário iniciar outra execução para listar casos. Nenhum token, URL assinada, cookie ou contato real foi arquivado. Pré-condições/perda de resposta, consolidação visual/regressão integral e sandbox externo conservam os recortes c2/d/C4.

Check/build exato da fonte9615088 aprovado no CI38353635010/job115151421694: artefato11791519006, checkout42c049dd/pais main9a25+fonte, árvore/lock/config/inventário conferidos em `ci65-build.json`. Matriz final local e execução geral remota mantêm comprovação própria.

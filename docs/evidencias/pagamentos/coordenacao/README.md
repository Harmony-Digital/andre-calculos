# Coordenação de reservas de cobrança

A migration 0060 evolui as RPCs de Pix manual e condição contratual. A confirmação manual confere a reserva antes de inserir um recebimento positivo. A condição contratual confere as reservas de todos os pedidos do cliente antes de mudar a flag e revisão, inclusive saldo de pedidos concluídos. Fase, mudança de conta e idade do claim não liberam uma reserva. Nenhuma dessas operações cancela cobrança no provedor.

Replay de recibos permanece antes da nova guarda. Conciliação do sinal sem crédito permanece disponível. Os locks dos perfis são ordenados antes do cliente, pedidos e pagamentos; o manual conserva a validação de contato apenas no ramo de novo recebimento. As RPCs continuam restritas ao papel autenticado e fazem autorização interna. Reserva ativa responde PT423/HTTP423 no PostgREST; as ações do Next retornam mensagens fixas de formulário, sem expor mensagens internas ou renovar a tentativa.

Ensaios exclusivamente fictícios no banco local:

- Vinte casos de coordenação: reserva e Pix nas duas ordens, reserva e contrato nas duas ordens, espera por lock observada antes do commit, rollback conjunto, replay/zero, retirada pré-despacho, claim antigo e saldo completed em outra conta.
- Seis unitários das ações: PT423, conflito anterior PT409 e erro privado; texto fixo, tentativa/formulário/revisão preservados e nenhuma revalidação em erro.
- Teste de navegador para as mensagens de Pix e contrato em 375/1440 px, preservação do formulário, ausência de crédito/alteração contratual, largura, capturas e Axe nas duas telas. Resultado final no plan.md.

Claims, entregas e mudanças de conta são preparações sintéticas desses ensaios; não comprovam autenticação, cancelamento ou operação do Asaas. O rollback próprio verifica aviso de pagamento; os avisos da fila continuam cobertos pelas regressões gerais de manual/contrato.

Comandos: bash scripts/dev-env.sh npm run test:rls; npm run check; bash scripts/dev-env.sh npm run test:e2e -- payment-reservation.spec.ts --workers=1; advisors locais de segurança e desempenho. Contagens, fonte, compilação e CI são registrados no plan.md.

Capturas verificadas: [Pix 375 px](pix-375.png), [Pix 1440 px](pix-1440.png), [contrato 375 px](contrato-375.png), [contrato 1440 px](contrato-1440.png). As dimensões representam a largura CSS do viewport; o celular tem escala de pixels do dispositivo. Dois testes de navegador passaram em 9,4 s, com Axe nas duas telas e ausência de overflow.

A fonte 43e5096bacd383b5628ca9c31c5e956897ab7148, [PR #21](https://github.com/Harmony-Digital/andre-calculos/pull/21), passou no check/build do [CI38189462022](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38189462022), qualidade114618881288:977 unitários/53 arquivos,43 scripts e sete páginas. Checkout01a4426a144caaa06cc739aad1f39cb239f8e038 e pais main9a25+fonte conferidos; extrato sanitizado SHA-256736186962b7b954c027daea128dc379d8b81347436174d6e3c65f165376c0766. Banco local:447 gerais/26 arquivos,63 focados finais;20 próprios e6 unitários próprios. Dois navegador375/1440 comAxe e quatro capturas inspecionadas. Read-back zero metadados/reservas/recibos contratuais e quatro perfis. Fonte preservada; resultado da suíte geral remota ainda em verificação no plan.md.

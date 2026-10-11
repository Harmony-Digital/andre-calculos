# Verificação local da regra de liberação

Ensaio de 2026-10-11 no Supabase local exclusivo do André. Identidades, processos, pagamentos, chave Pix e arquivos são fictícios.

- `bash scripts/dev-env.sh npm run check`: formatação, lint, tipos, 270 unitários e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls`: 64 aprovados, incluindo três cenários novos de aprovação e instruções financeiras.
- `bash scripts/dev-env.sh npm run test:e2e -- tests/e2e/delivery.spec.ts tests/e2e/delivery-history.spec.ts --workers=4`: seis aprovados, em 375/1440 px, com axe e verificação de largura.
- Migrations locais 0027–0028; SQL lint e advisors de segurança/desempenho sem achados.
- Suíte completa do navegador repetida após a correção: 77 aprovados; cinco ensaios únicos omitidos só no celular.
- Leitura final: 28 migrations, 25 tabelas públicas e duas internas com RLS; dados profissionais/Pix/aprovações legais vazios, política real pendente, zero preços ativos/processos/entregas/aprovações temporários e papel calculista confirmado.

Em Configurações, o calculista escolhe explicitamente a regra das próximas entregas e confirma sua aprovação. A escolha e a confirmação começam vazias, mesmo quando há uma regra atual. Uma alteração concorrente de configurações exige recarregar; não sobrescreve a revisão antiga. Depois de gravar, o formulário limpa escolha/confirmação e recebe a revisão atual. Entregas anteriores preservam a própria regra. Uma entrega confirmada sem regra pode recebê-la individualmente na pasta do processo, sem alterar arquivos ou identificação profissional.

As duas RPCs inferem o responsável pela sessão, exigem calculista e confirmação explícita, serializam tentativas e mantêm recibos imutáveis. Cliente, outro cliente, admin, anônimo e cliente de sistema sem ator foram recusados. Reenvio com a mesma chave/dados retorna o recibo original; dados divergentes ou outra tentativa sobre uma entrega já aprovada recebem conflito. Concorrência não duplica aprovação, evento ou auditoria. A aprovação individual registra “Regra de liberação aprovada” na linha do tempo, sem simular uma mudança de estado do pedido.

O cliente vê instruções financeiras somente no processo autorizado, para entregas que exigem saldo. O valor desconta apenas sinais/saldos confirmados: pagamento de triagem, pendente ou estornado não quita a obrigação. Pix ausente pede os dados na conversa. Não há acesso público às configurações privadas. A consulta aceita até cinquenta IDs; IDs de outro processo não retornam informações. Várias entregas do mesmo pedido mostram uma única pendência, associada à entrega elegível mais recente da página. O ensaio paginado verificou empates de data/UUID e políticas diferentes no mesmo pedido; uma entrega aprovada antes do saldo mantém sua liberação individual.

O navegador verificou configuração futura sem liberação retroativa, aprovação individual antes do saldo sem pagamento, saldo parcial de R$ 617,28, liberação depois do saldo confirmado e novo bloqueio após estorno. Download/conteúdo recusados retornaram 404; outro cliente permaneceu sem acesso. O PDF liberado foi baixado com bytes conferidos, redirecionamento privado sem cache, URL de 120 segundos e auditoria. Um link já emitido pode funcionar até vencer. Nenhum token ou URL assinada foi guardado nesta evidência.

O teste completo inicialmente reproduziu a perda da seleção feita antes de a interface terminar de carregar. O formulário agora habilita os campos depois desse carregamento; os ensaios repetidos preservaram a seleção. Capturas de celular/computador foram conferidas visualmente, inclusive o quadro de saldo e o formulário individual.

| Tela | Computador | Celular |
|---|---|---|
| Regra futura antes de aprovar | [captura](politica-futura-computador.png) | [captura](politica-futura-celular.png) |
| Regra individual antes de aprovar | [captura](regra-entrega-computador.png) | [captura](regra-entrega-celular.png) |
| Saldo pendente | [captura](saldo-pendente-computador.png) | [captura](saldo-pendente-celular.png) |
| Download aprovado antes do saldo | [captura](liberacao-antes-saldo-computador.png) | [captura](liberacao-antes-saldo-celular.png) |

Estes ensaios comprovam os controles locais. A escolha real de D6 continua aberta; não houve assinatura judicial verificada, pagamento real, publicação ou mensagem externa.

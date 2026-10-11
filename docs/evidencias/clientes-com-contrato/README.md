# Evidência de clientes com contrato — RF-32/RF-34

Verificação em 2026-10-11, exclusivamente no Supabase local `andre-calculos` (PostgreSQL 17, API `http://127.0.0.1:54321`). Usuários, contratos, propostas, documentos, pagamentos e motivos são inventados.

## Resultado dos comandos

```sh
cd app
npm run check
cd ..
bash scripts/dev-env.sh npm run test:rls
bash scripts/dev-env.sh npm run test:e2e -- client-contract.spec.ts manual-deposit.spec.ts quote-acceptance.spec.ts dashboard.spec.ts --workers=2
bash scripts/dev-env.sh npm run test:e2e -- client-contract.spec.ts --workers=2
DOCKER_HOST=unix:///Users/fabioalmeida/.colima/andre-calculos/docker.sock supabase db lint --local --schema public,private --level warning --output json
```

- `npm run check`: formatação/lint/tipos, 340 testes unitários e build aprovados.
- Banco: 142 testes aprovados em dezesseis arquivos, incluindo quinze casos de contrato e as regressões de aceite, sinal, arquivos, configuração, preferências e entrega.
- Navegador: 22 casos aprovados em 375/1440 px. Os seis casos de contrato foram repetidos após o ajuste da mensagem de sucesso e a proteção final do vínculo de pagamentos; todos aprovados.
- SQL lint: `No schema errors found` nos schemas `public` e `private`.

## Casos conferidos

| Caso | Resultado observado |
|---|---|
| Contrato antes do aceite | Não cria aceite/pagamento; aceite posterior sem documento aguarda envio |
| Contrato depois do aceite comum | Documento já confirmado permite entrada na fila; recibo original conserva a condição anterior |
| Documento posterior ao contrato | Hash/tamanho/pasta/vínculo reconferidos; upload real pelo navegador libera fila |
| Simulação ou pedido sem aceite | Conserva estado; não cria contratação nem fila |
| Resposta perdida | UUID e dados preservados; mesmo recibo, uma revisão e um aviso de fila |
| Duas intenções concorrentes | Uma revisão vence, outra recebe conflito sem sobrescrever |
| Replay depois de nova alteração | Recupera recibo histórico; condição atual não é desfeita |
| Motivo inválido/revisão ausente | Recusa conteúdo visualmente vazio, excesso e revisão inexistente; não presume zero |
| Retirada antes de iniciar trabalho | Falta de sinal retorna a aguardar pagamento; sinal confirmado mantém espera de documento |
| Pedido na fila/em andamento | Retirada recusada; formulário explica o motivo |
| Pagamento parcial anterior | Registro preservado; contrato não cria crédito nem estorno |
| Falha no último aviso de vários pedidos | Reverte condição, estados, registro privado e avisos anteriores na transação |
| Cadastro versus upload/sinal | Uma entrada efetiva na fila e um aviso; condição financeira reconferida |
| Papel do dono/pagamento sob lock | Espera PostgreSQL observada; reconfirma papel e parcela após liberar o bloqueio |
| Transferência de pagamento concorrente | Trigger recusa mudar pedido antes da FK; cadastro prossegue sem deadlock, pagamento mantém vínculo/status/valor |
| Cliente/admin/anônimo/serviço | Sem RPC de alteração/leitura do histórico; serviço não escreve colunas da condição |
| Privacidade | Motivo apenas no painel; ausente da conversa, linha do tempo e avisos do cliente |
| Interface | Erro preserva campos; sucesso limpa motivo; nova edição oculta sucesso antigo; axe sem violações e largura sem overflow |

## Conferência após limpeza

Read-back: 45 migrations, 25 tabelas públicas e treze privadas, todas com RLS. Funções `SECURITY DEFINER` com `search_path` vazio; FKs dos novos registros e recibos financeiros indexadas. Nenhum grant direto de `anon`, `authenticated` ou `service_role` nas seis tabelas internas de contexto/aceite/sinal/condição.

Permissões por coluna: serviço não tem INSERT/UPDATE de `has_contract` ou `contract_revision`; UPDATE de `legal_name` permanece permitido. `authenticated` não atualiza `has_contract`.

Preservados quatro perfis fictícios, um processo, um pedido e uma proposta do seed; um pagamento pendente e um aviso antigo de cadastro, além de 56 arquivos sintéticos anteriores. Zero contextos, aceites, intenções, recibos de sinal, alterações/flags/revisões de contrato, simulações, preços ativos, funções ou sessões de ensaio restantes. Dados profissionais/Pix reais continuam vazios.

Os advisors da nuvem não foram executados: as ferramentas do MCP dedicado ainda não estão disponíveis nesta sessão. O lint e a conferência local de catálogo acima não substituem essa revisão nem a ativação comercial.

## Capturas inspecionadas

- [Cadastro e histórico — computador](recibo-computador.png)
- [Cadastro e histórico — celular](recibo-celular.png)
- [Pasta após documento — computador](pasta-computador.png)
- [Pasta após documento — celular](pasta-celular.png)

Regras: [clientes com contrato](../../clientes-com-contrato.md). Andamento e próximas tarefas somente em `plan.md`.

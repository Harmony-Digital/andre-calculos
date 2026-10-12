# Transporte e provedor fictício duráveis

A migration0061 cria o provedor interno para os ensaios locais. O marker SQL começa desativado; RPCs internas exigem service_role, tabelas privadas têm RLS e nenhum grant direto. A porta servidor exige opt-in, URL exata http://127.0.0.1:54321 e ausência de ambiente Vercel/produção antes de criar o cliente de sistema e em cada chamada. Nenhum endereço do Asaas é acessado; URLs são interpretadas pela allowlist, e o transporte usa somente RPC no banco local.

Clientes e cobranças fictícios possuem IDs aleatórios. A referência não tem unicidade artificial: duas criações com chaves distintas aparecem como candidatos múltiplos. O journal registra chave/fingerprint/resultado imutáveis; repetir a mesma chave só recupera o fato, enquanto o contador registra outra invocação concluída da RPC. Operações recusadas antes do commit não são tratadas como envio ao provedor. A chave é uma propriedade do protocolo interno, não uma garantia de idempotência da API real.

Falhas controladas da fixture simulam não despacho explícito, resultado indeterminado antes do efeito, perda de resposta depois da criação, resposta inválida, indisponibilidade e consulta insuficiente. Perda depois da criação confirma o fato e devolve indeterminate; consulta em nova porta encontra esse fato. Nenhuma exceção depois de um INSERT é usada para fingir persistência após rollback.

POST de pagamento exige intenção, reserva, claim0059 preexistente, contexto/binding/dívida vigentes, cliente coerente e notificações desativadas sob locks comuns. Essa parte não adquire um claim novo nem comprova o POST único pelo executor; O/P completam bootstrap e retomada antes de fechar I. Identificar uma cobrança não credita pagamentos, muda fila nem emite aviso financeiro.

Ensaios próprios:34 unitários da guarda/protocolo/scopes/tokens exatos/recibos e25 integrações reais de permissões, replay, concorrência, tipos JSON, perdas pós-criação, duplicatas, consulta insuficiente e ausência de efeito financeiro. Um processo Node servidor distinto recupera o recibo emitindo apenas PID/UUID/data. O marker é restaurado e os fatos são removidos por scope na limpeza. A compilação e resultados gerais da fonte final constam do plan.md.

Recibos internos contêm documento e URL de fatura no bodyText, necessários à porta. São privados e restritos ao executor: não devem chegar à UI, logs, comentários, capturas ou extratos de evidência. Não autenticam a conta Asaas nem provam cobrança/cancelamento externos.

Comandos: npm run check; bash scripts/dev-env.sh npm run test:rls; advisors locais de segurança/desempenho. Nenhuma migration ou configuração foi aplicada à nuvem.

Fonte final ce6c3a211bee3110387664a345774a835a869d87, PR #22: qualidade114625508727 do CI38191659515 aprovada com1011 unitários/54 arquivos,43 scripts, npm run check/build e sete páginas. Checkout8cd4dee44c3d28f4682c9bcaef883ac77ce7985a tem pais main9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd e a fonte final conferidos; extrato sanitizado SHA-2567c98fadb7758e3bfac24e99b4dec7961baba81fd267500bf16a93513cc2bacd3. A suíte geral remota ainda estava em execução na coleta; não há declaração de CI integral. Localmente,472 testes de banco/27 arquivos passaram. Read-back sem fatos do simulador e marker desligado; duas revisões sem bloqueador.

Uma nova consulta deve ter novo slot durável. Reutilizar o slot de uma consulta reproduz seu recibo anterior; isso não é uma observação nova. Os ensaios de O/P precisam distinguir tentativas do produtor e replay do transporte ao comprovar que houve somente um POST.

# Transporte e provedor fictício duráveis

A migration0061 cria o provedor interno para os ensaios locais. O marker SQL começa desativado; RPCs internas exigem service_role, tabelas privadas têm RLS e nenhum grant direto. A porta servidor exige opt-in, URL exata http://127.0.0.1:54321 e ausência de ambiente Vercel/produção antes de criar o cliente de sistema e em cada chamada. Nenhum endereço do Asaas é acessado; URLs são interpretadas pela allowlist, e o transporte usa somente RPC no banco local.

Clientes e cobranças fictícios possuem IDs aleatórios. A referência não tem unicidade artificial: duas criações com chaves distintas aparecem como candidatos múltiplos. O journal registra chave/fingerprint/resultado imutáveis; repetir a mesma chave só recupera o fato, enquanto o contador registra outra invocação concluída da RPC. Operações recusadas antes do commit não são tratadas como envio ao provedor. A chave é uma propriedade do protocolo interno, não uma garantia de idempotência da API real.

Falhas controladas da fixture simulam não despacho explícito, resultado indeterminado antes do efeito, perda de resposta depois da criação, resposta inválida, indisponibilidade e consulta insuficiente. Perda depois da criação confirma o fato e devolve indeterminate; consulta em nova porta encontra esse fato. Nenhuma exceção depois de um INSERT é usada para fingir persistência após rollback.

POST de pagamento exige intenção, reserva, claim0059 preexistente, contexto/binding/dívida vigentes, cliente coerente e notificações desativadas sob locks comuns. Essa parte não adquire um claim novo nem comprova o POST único pelo executor; O/P completam bootstrap e retomada antes de fechar I. Identificar uma cobrança não credita pagamentos, muda fila nem emite aviso financeiro.

Ensaios próprios:34 unitários da guarda/protocolo/scopes/tokens exatos/recibos e25 integrações reais de permissões, replay, concorrência, tipos JSON, perdas pós-criação, duplicatas, consulta insuficiente e ausência de efeito financeiro. Um processo Node servidor distinto recupera o recibo emitindo apenas PID/UUID/data. O marker é restaurado e os fatos são removidos por scope na limpeza. A compilação e resultados gerais da fonte final constam do plan.md.

Recibos internos contêm documento e URL de fatura no bodyText, necessários à porta. São privados e restritos ao executor: não devem chegar à UI, logs, comentários, capturas ou extratos de evidência. Não autenticam a conta Asaas nem provam cobrança/cancelamento externos.

Comandos: npm run check; bash scripts/dev-env.sh npm run test:rls; advisors locais de segurança/desempenho. Nenhuma migration ou configuração foi aplicada à nuvem.

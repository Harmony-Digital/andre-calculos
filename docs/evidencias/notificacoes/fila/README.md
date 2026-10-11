# Reservas e resultados da fila local — 2026-10-11

A fila canônica é `public.notifications`, já criada em 0001 e preenchida atomicamente pelos casos de uso existentes. Não foi criada outra fila `outbox`. Este núcleo prepara reservas exclusivas e resultados persistentes; não há transporte, endpoint novo, cron, envio externo ou alteração de banco na nuvem.

## Contrato verificado

- `claim_notification_local_system`: uma requisição UUID reserva no máximo um aviso devido do canal, usando lock da linha/`SKIP LOCKED`. O nonce é persistente: repetir os mesmos parâmetros recupera a reserva original, inclusive vazia; parâmetros divergentes são recusados. A lease é revalidada depois do lock. O contador fica entre zero e cinco.
- Conteúdo, canal, destinatário e deduplicação ficam imutáveis após a primeira reserva. Snapshot de dados/template, hash e chave estável `notification:<UUID>` são preservados nas tentativas seguintes. O snapshot não é HTML final nem uma versão renderizada do template de um provedor.
- `validate_notification_local_claim`: confere reserva vigente, estado e ausência de recibo. Para lembretes, trava o pedido original antes da notificação, verifica estado/prazo não nulo e preserva o cancelamento da migration0030. Não envia nada e não substitui revalidação de público/preferências no adaptador futuro.
- `complete_notification_local_system`: resultado e projeção são atômicos; repetição idêntica recupera o recibo, e resultado conflitante é recusado. Falha comprovadamente repetível espera 1/5/15/60 minutos pelo relógio do banco; a quinta é terminal. Falha permanente termina imediatamente. Resultado incerto ou lease expirada fica `failed`/`held`, sem reenvio automático. Aviso cancelado nunca volta a `sent` ou `pending`.
- Recibos têm `execution_mode=simulation`. `sent` nos ensaios significa exclusivamente um resultado fictício registrado no banco local; não comprova e-mail ou WhatsApp entregue. Na expiração, o resultado solicitado e o efetivo incerto são distintos, preservando replay. Expiração automática nunca credita sucesso tardio.

As duas tabelas privadas têm RLS e nenhum grant a `anon`, `authenticated` ou `service_role`; seus registros não aceitam UPDATE. Somente os RPCs públicos restritos ao sistema operam sobre eles. UPDATE direto de `notifications` foi retirado do serviço. Produtores e cancelamento transacionais continuam funcionando. O módulo de servidor exige o banco local exato, flag de ensaio e ausência de ambiente Vercel antes de criar o cliente; erros retornados ou lançados são substituídos por mensagens fixas sem conteúdo privado.

## Ensaios

Migration0052 foi aplicada localmente e preservada. A revisão independente identificou a necessidade de separar resultado solicitado/efetivo na expiração, revalidar a lease sob lock e congelar o conteúdo original; migration0053 corrige esses pontos. Migration0054 rejeita um deadline sem prazo explícito. Nenhuma dessas migrations foi aplicada à nuvem.

Comandos reproduzíveis, sempre usando o Supabase/Colima local dedicado:

```sh
bash scripts/dev-env.sh supabase migration up --local --workdir ..
bash scripts/dev-env.sh npm run test:rls
cd app
npm run check
```

Dezesseis testes unitários próprios aprovados; conjunto geral de 434 unitários/43 arquivos e 25 testes de scripts, formato/lint/tipos aprovados. Primeira execução de banco encontrou dois erros de preparo das fixtures (motivo sintético fora do enum e limpeza chamada com objeto em vez do ID), corrigidos. A regressão de cancelamento marca seus estados sintéticos pelo proprietário local, mantendo a retirada de UPDATE do serviço. Processo fictício residual daquela primeira limpeza foi identificado por ID/marcador/data, conferido sem filhos e removido; outros processos foram preservados.

A execução local de `npm run check` passa até o build, que encontra a restrição preexistente da porta interna do Turbopack (`EPERM`). O mesmo código passou no `npm run check`/build remoto do [CI38173586727](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38173586727), job qualidade114571144088, fonte `558a5c7ebefad7150302280a86efa8340c43cb91`: 434 unitários/43 arquivos, 25 scripts e build Next.js16.4 aprovados.

## Limites para o executor e a ativação

O núcleo não comprova entrega exatamente uma vez. Reserva e proteção do estado no banco não retiram um envio externo já iniciado; integração real exige idempotência/reconciliação do provedor e revalidação de vínculo, destinatário e preferências. Não há liberação de uma tentativa incerta sem conferência. Executor fictício é M1.51b; endpoint, cron e transportes reais são M1.51c/M2.28b/M2.29, sujeitos aos insumos e autorizações do plano.

Referências primárias da implementação: [SELECT e SKIP LOCKED no PostgreSQL17](https://www.postgresql.org/docs/17/sql-select.html) e [ordem de locks/deadlocks](https://www.postgresql.org/docs/17/explicit-locking.html). A documentação fundamenta o mecanismo; os ensaios locais verificam os caminhos específicos desta aplicação.

Ensaio geral de banco aprovado: 340 testes/21 arquivos, incluindo 25 próprios de reservas/resultados; estes 25 foram repetidos após a última guarda de identidade do wrapper. Dois resultados conflitantes concorrentes produzem um único recibo, e alteração do prazo concorrente à validação preserva cancelamento sem deadlock. Advisors locais de segurança e desempenho retornaram `No issues found`; lint SQL sem erros novos, apenas avisos preexistentes de variáveis sobrepostas/não usadas em `valid_signup_cpf`/`valid_signup_cnpj`. A segunda revisão confirmou privacidade/permissões; a lacuna de identidade no retorno `held` foi corrigida e testada.

Fonte remota conferida no [PR #11](https://github.com/Harmony-Digital/andre-calculos/pull/11): `558a5c7ebefad7150302280a86efa8340c43cb91`; suíte geral remota ainda em execução, sem outro push. O read-back local confirmou zero reservas/recibos e nenhum trigger/processo residual das fixtures próprias. Advisory preexistente/revisão integral de segurança continuam abertos em M2.35a; check aprovado não os encerra.

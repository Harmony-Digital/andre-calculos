# Contrato privado da proposta aceita

O aceite congela identificação do contratante, proposta, serviços/valores, dados profissionais, textos e prova do aceite. A intenção de geração é registrada na mesma transação. O PDF usa somente esse snapshot; alterações posteriores no perfil ou nas configurações não reescrevem o contrato histórico. Aceites antigos sem identificação completa informam a lacuna, sem preencher pelo perfil atual.

O andamento do projeto e o ponto de retomada ficam exclusivamente em [plan.md — Onde estamos](../plan.md#onde-estamos). Este documento descreve o funcionamento e a operação do recurso.

## Percurso na interface

Após o aceite, o cartão do contrato aparece na proposta e na pasta do processo. Enquanto a geração está pendente, o cliente pode atualizar ou solicitar retomada. Quando o arquivo é confirmado, o cartão oferece o download. Uma falha na geração não desfaz nem repete o aceite.

A consulta automática de disponibilidade é limitada a dez tentativas de 2,5 segundos. Encerrado esse acompanhamento, a intenção continua no banco e pode ser retomada. O calculista também consulta o contrato; outro cliente, admin e anônimo não recebem os bytes.

## Geração e integridade

O processador reserva uma intenção com claim, epoch e prazo de dois minutos. Renderiza o snapshot e registra SHA/tamanho antes do transporte. O upload usa o bucket privado `processos` e não permite sobrescrita. Mesmo que o retorno do upload se perca, o processador relê o objeto e só associa o arquivo à proposta após conferir seus bytes.

Uma reserva vencida pode ser retomada. Um trabalhador antigo não finaliza uma reserva nova. Um objeto divergente é preservado e a geração fica em quarentena; não substituir nem apagar o objeto automaticamente para mascarar o conflito. Metadados e associação arquivados são imutáveis.

O aceite agenda o trabalho fora de sua resposta com `after()`. O consumidor de fila seleciona no máximo cinco intenções por chamada e ignora arquivo pronto, reserva viva e quarentena. A intenção no banco permite recuperação se o agendamento inicial não executar.

## Rotas e permissões

| Rota | Contrato |
|---|---|
| `GET /api/quotes/[id]/contract/status` | Estado privado para o dono ou calculista autenticado; não retorna conteúdo nem caminho de Storage |
| `GET /api/quotes/[id]/contract` | Autoriza a proposta, lê Storage no servidor, confere SHA/tamanho, registra auditoria com o ator da sessão e retorna PDF como attachment, sem cache |
| `GET /api/cron/contract-pdfs` | Consumidor de lote com Bearer, comparação constante, `CRON_SECRET` de pelo menos 16 caracteres e guarda local; recusa parâmetros de query |

O registro de download concluído é exclusivo do servidor e revalida papel/dono. O navegador não fornece SHA, caminho ou identidade para forjar esse registro. Nenhuma rota publica URL assinada, segredo ou payload bruto.

As tabelas de geração, claims, metadados e associação têm RLS e nenhum acesso direto concedido aos papéis da aplicação. As RPCs de reserva/preparo/finalização/falha/lote são exclusivas do serviço. Os getters e a autorização de download exigem a sessão e seu escopo.

## Limite do produtor e ativação

`localContractWorkerEnabled()` exige simultaneamente:

- `ANDRE_LOCAL_TESTS=1`;
- destino Supabase exatamente `http://127.0.0.1:54321`;
- ausência de `VERCEL` e `VERCEL_ENV`;
- `NODE_ENV` diferente de `production`.

A guarda roda antes de criar o cliente de serviço. O recurso não habilita um produtor de contratos em nuvem apenas por cadastrar uma variável. Ativação comercial exige tratar explicitamente o produtor, textos/identificação aprovados, infraestrutura, autorização e verificação no destino. Não configurar cron ou variáveis de produção como parte do ensaio local.

## Verificação dirigida

Com o runtime local pronto, a partir da raiz do repositório:

```sh
bash scripts/dev-env.sh npm run test:rls -- tests/integration/contract-archive.test.ts
bash scripts/dev-env.sh npm run test:e2e -- tests/e2e/contract-archive.spec.ts --workers=1
```

O wrapper fornece configuração local somente ao processo; não cria arquivo de segredo. Os testes usam contas e dados fictícios. Antes de executá-los, confira os processos e leases ativos para respeitar a regra de um escritor. Não rodar reset/reseed ou outra suíte de banco em paralelo.

O teste de banco cobre reserva/replay/concorrência, falhas de transporte, divergência de objeto, isolamento, rollback e retomada. O navegador cobre aceite com retorno perdido, recuperação, proposta/pasta, download com conferência de bytes e negação aos outros papéis em celular e computador. O checklist completo de qualidade continua em `AGENTS.md`; repetir ensaios depende de alteração ou falha concreta.

## Primeira validação hospedada

O preparo autorizado em19/10 permite a geração do mesmo PDF a partir do snapshot sintético já preparado, exclusivamente quando `ANDRE_VALIDATION_MODE=1` e projeto Vercel, ambiente production, domínio e Supabase coincidem com o manifesto. Autorização do cliente/calculista, reserva, hash, bucket privado e auditoria permanecem obrigatórios. As flags locais continuam restritas ao localhost. Não configurar cron ou `CRON_SECRET` nesta validação. Esse opt-in não ativa contratação comercial nem aceita orçamento simulado como real. Consulte `docs/validacao/operacao.md`.

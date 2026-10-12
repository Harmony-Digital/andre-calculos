# Ensaio conectado do cliente e do André

`app/tests/e2e/full-journey.spec.ts` percorre uma única jornada, em 375 e 1440 px, com duas sessões independentes. O cliente é criado pelo formulário e confirma o e-mail no Mailpit; o André usa o calculista fictício do seed. O cliente, o processo e o pedido permanecem os mesmos até o download.

```sh
bash scripts/dev-env.sh npm run test:e2e -- full-journey.spec.ts --workers=1
```

O teste passa pelas nove etapas do checklist, gera a proposta simulada e seu PDF, registra aceite, confirma sinal, envia documento com integridade verificada, troca mensagens, registra decisão e concordância, opera análise/cálculo/espera/revisão pela interface, envia três artefatos e confirma a entrega. Axe e ausência de rolagem horizontal são verificados nas páginas principais dos dois papéis. As etapas operacionais não atestam o cálculo realizado no PJe-Calc nem a assinatura ICP-Brasil.

## Preparações sintéticas explícitas

Duas fronteiras têm nome próprio no relatório do Playwright:

1. **Contexto contratual:** a proposta simulada não pode ser aceita ou promovida. Depois de verificar esse bloqueio, o helper remove somente a simulação daquele pedido e prepara outra proposta e contexto contratual fictícios no PostgreSQL local. Isso permite testar o aceite, sem habilitar o produtor comercial de M2.12.
2. **Saldo:** o ensaio aprova pela interface somente a regra daquela entrega fictícia, após constatar que a regra global nula bloqueia arquivos. A política `after_balance` ainda nega download com saldo pendente. O crédito de saldo é preparado localmente, pois a confirmação comercial de saldo pertence a M3.09.

Não há preparação direta de `in_review`: o calculista inicia análise e cálculo, aguarda esclarecimento fictício, retoma a etapa exata, envia à revisão, devolve ao cálculo com motivo e envia novamente à revisão. O cliente acompanha situação e motivos no histórico. Os prazos não mudam enquanto D11 permanece aberta. `order-operations.spec.ts` também verifica resposta perdida, replay após avanço posterior e conflito seguido de recarga completa.

Essas preparações não equivalem à contratação comercial completa. Os dados profissionais, calendário, capacidade, preços, textos aprovados e decisões do responsável técnico continuam sujeitos às condições do plano. Nenhum dado de processo real entra neste ensaio.

## Isolamento e limpeza

O helper exige Supabase local em `127.0.0.1:54321`, mantém um lease de settings e outro da fila na ordem usada pelos testes existentes e valida o proprietário antes das pontes. As credenciais são efêmeras, em memória. Não há `.env`, estado de sessão, trace ou HAR exportado.

As quatro contas seed e as contas temporárias de perfil/recuperação são provisionadas pelo helper administrativo `app/scripts/provision-local-user.ts`, com autorização privada de uso único por UUID; não recebem consentimentos fictícios. O novo cliente da jornada continua usando o formulário público, aceite de versões sintéticas e confirmação no Mailpit. O hook exige o mesmo aceite também nas chamadas diretas ao Auth; esse ensaio não aprova textos para uso comercial.

Ao terminar, inclusive após falha, remove arquivos pelos caminhos daquele processo, recibos privados e registros relacionados ao novo cliente, restaurando settings e a tabela ativa anterior. Não apaga auditorias do calculista seed em massa. O histórico de preços fictícios permanece inativo, como nos ensaios existentes.

O download deve retornar 307 com `private, no-store` e `no-referrer`, assinar para a origem local por 120 segundos, entregar os bytes originais e registrar auditoria do cliente. Rejeições da chamada assinada são sanitizadas para não expor o token.

## Execução no CI

O workflow `.github/workflows/qualidade.yml` tem jobs separados `qualidade` e `e2e`. Este último instala Chromium, Poppler e Supabase CLI 2.113.0, inicia a instância local, roda RLS e navegador sequencialmente, confere advisors e encerra os serviços mesmo após falha. Não usa conexão de nuvem ou credenciais de produção.

A CLI usa a ação oficial com versão fixa e Node 22; o navegador usa um worker para evitar concorrência entre fixtures globais. Referências: [Supabase setup-cli](https://github.com/supabase/setup-cli) e [Playwright no CI](https://playwright.dev/docs/ci#workers).

O wrapper registra máscaras no GitHub antes de iniciar processos filhos, conforme [os comandos do runner](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#masking-a-value-in-a-log). O job conserva somente capturas PNG por sete dias, inclusive após sucesso, para inspeção visual; máscaras de logs não sanitizam arquivos. A conclusão de M2.34 requer a execução real do job verde, registrada no `plan.md`.

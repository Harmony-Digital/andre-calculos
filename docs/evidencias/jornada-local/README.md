# Evidência da jornada conectada — M2.34

Verificação em 2026-10-11, exclusivamente na API local `http://127.0.0.1:54321`, PostgreSQL 17 e navegador local. Cliente, processo, empresa, propostas, pagamentos e arquivos são inventados. Nenhuma mensagem ou cobrança foi enviada.

## Comandos conferidos

```sh
bash scripts/dev-env.sh npm run test:e2e -- --workers=1
bash scripts/dev-env.sh npm run test:rls
bash scripts/dev-env.sh npm run test:e2e -- full-journey.spec.ts --workers=1
cd app
npm run check
```

- Suíte completa do navegador: 109 aprovados e sete omitidos apenas no projeto celular; 116 casos no total. As omissões são ensaios únicos já executados em computador, como 300 MiB e e-mail.
- Banco: 142 testes aprovados em dezesseis arquivos.
- Jornada repetida após o ajuste final: dois casos aprovados, em 375/1440 px. Axe sem violações WCAG A/AA e ausência de rolagem horizontal nas dez páginas principais de cada largura.
- Qualidade final: tipos, formatação, lint, 340 testes unitários e build aprovados.
- Advisors locais de segurança e desempenho: `No issues found` nas duas consultas, com `--level warn --fail-on error`.
- O smoke test dos scripts do CI confirmou que a saída de um `supabase start` simulado acima de 4 MiB não estoura o buffer e que as máscaras de credenciais locais precedem o processo filho.

## O que a jornada prova

O mesmo cliente é cadastrado pela interface e confirma o e-mail no Mailpit. O mesmo pedido percorre checklist, simulação, aceite, sinal, envio de PDF, fila, conversa, decisão com concordância, entrega e download. André e cliente usam contextos independentes.

O sinal de R$ 125,01 corresponde ao total fictício de R$ 250,01 e saldo de R$ 125,00. Sinal sem documento mantém a espera; o upload confirmado libera uma única entrada na fila. Autoria, SHA-256 e avisos enfileirados são conferidos no banco.

A entrega sem regra aprovada nega bytes. A regra individual `after_balance` aprovada pela interface continua negando download sem saldo, mantendo a regra global vazia. Após o crédito sintético de saldo, os três arquivos são baixados: redirecionamento 307, `private, no-store`, `no-referrer`, assinatura local de 120 segundos, bytes originais e auditoria do cliente. Tokens, cookies, traces e HAR não foram exportados.

Na revisão visual foi encontrado corte dos botões de conclusão do checklist em celular. Os controles agora empilham nessa largura e quebram linha quando necessário; o teste confere que todos cabem no painel, pois a ausência de overflow na página não detectava esse recorte interno.

## Limites explícitos

O relatório dá nome a três preparações sintéticas: contexto contratual, revisão técnica e confirmação de saldo. Elas estão detalhadas no [guia do ensaio](../../jornada-local.md). A simulação permanece impedida de contratar; não foi promovida nem foi alterado o bloqueio comercial da aplicação.

Este ensaio não valida regras comerciais reais, as transições intermediárias do trabalho manual, cálculo judicial, certificado digital, envio externo ou produção. As capturas de aceite e entrega mostram os formulários antes da confirmação; recibos, estados posteriores e bytes são comprovados pelas asserções.

## Read-back após limpeza

45 migrations, 25 tabelas públicas e treze privadas, todas com RLS. Preservados quatro perfis fictícios, um processo, um pedido, uma proposta, um pagamento pendente, um aviso antigo e 58 arquivos sintéticos de ensaios anteriores.

Zero novos clientes, contextos, aceites, intenções, simulações, recibos de sinal, alterações/flags/revisões de contrato, preços ativos, funções ou sessões temporárias. Dados profissionais/Pix reais ausentes. Funções definer com `search_path` vazio e FKs financeiras/de contrato indexadas; sem grants diretos nos seis conjuntos de recibos/contextos privados. O histórico imutável de preços fictícios foi conservado inativo.

## Capturas

Há dez capturas finais por largura, inspecionadas visualmente. Dados reais nunca entram nas evidências.

| Etapa | Computador | Celular |
|---|---|---|
| Cadastro | [Imagem](computador/01-cadastro.png) | [Imagem](celular/01-cadastro.png) |
| Checklist | [Imagem](computador/02-checklist.png) | [Imagem](celular/02-checklist.png) |
| Simulação | [Imagem](computador/03-proposta-simulada.png) | [Imagem](celular/03-proposta-simulada.png) |
| Aceite sintético | [Imagem](computador/04-aceite.png) | [Imagem](celular/04-aceite.png) |
| Sinal pelo André | [Imagem](computador/05-sinal-andre.png) | [Imagem](celular/05-sinal-andre.png) |
| Documento | [Imagem](computador/06-documento-cliente.png) | [Imagem](celular/06-documento-cliente.png) |
| Conversa | [Imagem](computador/07-conversa.png) | [Imagem](celular/07-conversa.png) |
| Decisão | [Imagem](computador/08-decisao.png) | [Imagem](celular/08-decisao.png) |
| Entrega pelo André | [Imagem](computador/09-entrega-andre.png) | [Imagem](celular/09-entrega-andre.png) |
| Download do cliente | [Imagem](computador/10-download-cliente.png) | [Imagem](celular/10-download-cliente.png) |

Andamento e conclusão do CI são registrados exclusivamente em `plan.md`.

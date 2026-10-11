# Evidências do sinal manual — M2.16

Ensaios executados em 2026-10-11 no Supabase local exclusivo `andre-calculos`,
com usuários, processos, preços, identificação profissional e chave Pix fictícios.
Os contextos comerciais positivos foram preparados somente pelo PostgreSQL local;
o emissor de simulações permanece bloqueado para contratação real.

- `npm run check`: 337 unitários, formatação, lint, tipos, cobertura e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls -- --reporter=verbose`: 127 testes aprovados, incluindo treze do recebimento manual.
- `bash scripts/dev-env.sh npm run test:e2e -- tests/e2e/manual-deposit.spec.ts tests/e2e/quote-acceptance.spec.ts --workers=1`: quatorze testes aprovados, sete em 1440 px e sete em 375 px.
- `supabase db lint --local --schema public,private --level warning --output json`: informou `No schema errors found`.

Os testes de banco verificam autorização por papel/processo, aceite obrigatório,
hash/valor divergentes, dois UUIDs concorrentes, recibo após cancelamento, sinal
ímpar, depósitos parciais, triagem/saldo/pendências/estornos excluídos, reconciliação
sem crédito duplicado e bloqueio do sinal zero. O estorno conserva o recibo e o
UUID original não restaura `confirmed`.

Documento anterior e posterior ao recebimento, corrida entre confirmação/upload,
hash inválido e pastas de triagem/entrega foram conferidos. Um lock PostgreSQL
observado demonstra que a confirmação espera a promoção de uma parcela pending,
recalcula o restante e recusa a intenção antiga. A falha sintética do aviso de fila
reverte pagamento, estado, recibo e eventos. O contrato histórico não libera a
fila depois de perder a condição atual.

No navegador, a perda da resposta depois da gravação deixa o formulário apto ao
reenvio; a segunda tentativa recupera o pagamento original. O cliente vê o Pix
somente no processo próprio e perde as instruções quando o sinal é satisfeito.
Pix ausente orienta a conversa, contrato dispensa a confirmação e o estorno fica
explícito. Axe não encontrou violações nas telas examinadas; a chave extensa não
causou rolagem horizontal. As seis capturas abaixo foram inspecionadas:

| Tela | Computador | Celular |
|---|---|---|
| Pix do cliente | [1440 px](pix-computador.png) | [375 px](pix-celular.png) |
| Recibo do André | [1440 px](recibo-computador.png) | [375 px](recibo-celular.png) |
| Contrato | [1440 px](contrato-computador.png) | [375 px](contrato-celular.png) |

O read-back confirmou 42 migrations, 25 tabelas públicas e doze internas, todas
com RLS, sem search_path inseguro nas funções security definer e sem FKs sem
índice nas duas novas tabelas. Não há grants diretos das cinco tabelas contratuais
para anon/authenticated/service_role. Contextos, aceites, intenções e recibos de
sinal dos ensaios foram removidos, assim como funções e sessões temporárias.

Foram preservados quatro perfis, um processo/pedido e a proposta TESTE-1 do seed,
56 metadados de arquivos sintéticos antigos, o depósito `pending` do pedido
P-TESTE-0001 do seed e um aviso antigo de cadastro. Preços ativos e dados profissionais/Pix reais
continuam vazios. Nenhum aviso novo de sinal permanece e nenhum despacho externo
foi executado. Os advisors da nuvem aguardam a conexão Supabase dedicada.

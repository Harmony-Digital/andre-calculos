# Evidências de M3.01t — observações financeiras

Recorte autorizado: implementação local fictícia do M3.00, aprovado pelo Fábio na fonte b9b687d. Este ensaio não envia HTTP ao Asaas nem usa segredos/contas comerciais. A ativação real e a confirmação do contrato externo da prova permanecem nas tarefas específicas do plano.

## Proveniência e persistência

As migrations 0068–0073 registram identidade financeira por escopo/cobrança, consultas independentes e observações imutáveis ligadas aos recibos originais R/N. A entrada superior recebe IDs internos; expectativa, cliente, conta, cobrança, intenção, valor e vencimento são recuperados pelo servidor. O domínio conserva fatos mínimos, hash e identificadores, sem documento, URL de fatura ou body do provedor.

Uma consulta nova tem slot, protocolo, revisão e worker próprios. O protocolo é capturado antes do transporte. A finalização registra a fonte em transação própria; uma finalização antiga preserva o journal sem limpar a consulta atual. Replay recupera o mesmo recibo; fatos divergentes da mesma fonte deixam conflito durável, preservando a observação original.

A revisão `fixtureStateRevision` sai da mesma linha que gera o body N. Vale somente para o produtor fictício vinculado; ausente ou inválida permanece desconhecida. O horário de chegada não escolhe vencedor financeiro. A comparação reaproveita a lógica cumulativa de F sem fabricar eventos ou datas Asaas e conserva multiplicidade de estornos/histórico de reversões.

## Prova de chargeback

`chargeback.fixtureProof` é um namespace de ensaio, congelado no body N e lido pelo parser lossless. Registra ocorrência, débito efetivado e reversões ligadas ao mesmo débito, com centavos seguros. Não altera o contrato Asaas nativo: F conserva suas incertezas; a prova adicional só comprova seus próprios campos. Status isolado, reversão sem débito, valor excedente, identidade divergente e desaparecimento da prova não restauram crédito.

O SQL confirma hash, operação, scope, slot, fingerprint, payload e campos monetários da origem. A prova exige correspondência integral e única de reversões; UUID equivalente é aceito, mas referência ausente/null é recusada. As tabelas têm RLS, sem grants de tabela aos papéis da aplicação. Observações/conflitos são auditados com IDs mínimos.

## Verificações

- `npm --prefix app run check`: formato, lint, tipos, 1138 unitários/59 arquivos e 43 testes de scripts aprovados. O build local encontra o bloqueio preexistente de porta no processamento CSS do react-pdf/Turbopack (`Operation not permitted`); a confirmação do build da fonte será registrada no CI em `plan.md`. SHA-256 do log: `fbb688d3b6c5bc2df5df9897188a1f09d260f886770e0a80daccf7d88c2f5928`.
- `bash scripts/dev-env.sh npm run test:rls -- tests/integration/payment-financial-observations.test.ts`: 30 casos próprios aprovados. Recuperação em processo distinto; replay/conflito; protocolo/worker inválidos; finalização antiga; 404/ausência/deleted; parcial/excesso/taxa; chargeback desconhecido/débito/reversão; referência uppercase/ausente/null; ordem desconhecida; rollback posterior; mesma cobrança textual em contas distintas e consulta após retirar a reserva/configuração.
- Advisors locais de segurança e desempenho após cada migration: sem achados. Log final após 0073: SHA-256 `97540f3494191882bfdb34e0ce0f4c388fadcbcc74d8eb41200ead6110c07daa`.
- Duas revisões independentes somente por leitura, com os achados corrigidos e sem bloqueador restante no recorte. Os revisores não executaram os ensaios.

Os testes conferem antes/depois que não há crédito, aviso, resolução financeira, fila ou liberação de download nesta parte. U/V continuam necessários para a aplicação/projeção comum e a jornada do usuário. O registro geral e as próximas tarefas ficam exclusivamente em `plan.md`.

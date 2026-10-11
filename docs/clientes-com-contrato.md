# Clientes com contrato

O calculista registra em `/painel/clientes` se o cliente paga no final. A alteração exige motivo, usa a revisão atual do cadastro e registra responsável, instante e resultado dos pedidos. O motivo aparece apenas no painel do André; não entra na linha do tempo compartilhada nem nos avisos.

## Entrada na fila

Registrar contrato dispensa o sinal; não cria pagamento, aceite, crédito ou estorno. Um pedido entra na fila somente com proposta aceita, condição financeira apta e documento confirmado na pasta do processo. Sem aceite, o pedido conserva seu estado. Aceite sem documento passa a aguardar documentos. Com os dois, entra na fila e enfileira o aviso ao André.

Isso funciona antes ou depois do aceite comum. O recibo do aceite mantém a condição daquela data; a pasta mostra a condição atual. O primeiro documento posterior confere novamente contexto aceito, integridade, pasta e vínculo ao pedido. Documento pendente, com hash divergente, de outra pasta ou de outro pedido não libera trabalho. Simulações continuam sem contratação.

Pagamentos anteriores são preservados. A dispensa do sinal não significa quitação; o saldo da entrega continua sendo calculado a partir de recebimentos confirmados.

## Retirada da condição

Antes do início do trabalho, o calculista pode retirar a condição com motivo. Pedidos aceitos sem sinal suficiente voltam a aguardar pagamento. Os que já têm o sinal confirmado continuam aguardando documento ou passam pela guarda de fila.

A retirada é recusada enquanto houver pedido deste cliente na fila, em análise, aguardando cliente, em cálculo, em revisão, em ajuste ou entregue. Assim, uma edição do cadastro não reabre cobrança nem altera trabalhos em andamento. Não há comando de cancelamento ou reembolso neste formulário.

## Concorrência e histórico

`set_client_contract` infere o ator de `auth.uid()` e aceita apenas calculista. Motivo de três a mil caracteres, revisão explícita e UUID são obrigatórios. Espaços Unicode e quebras de linha nas extremidades são normalizados como no formulário; um motivo visualmente vazio é recusado também por chamada direta.

O UUID vincula cliente, ator, condição, motivo e revisão original. Repetir a mesma solicitação recupera o recibo sem repetir efeitos. Reutilizá-lo com outros dados é recusado. Uma revisão antiga não sobrescreve outra alteração. Replay antigo retorna o histórico e não desfaz uma decisão posterior; a action confere o cadastro atual antes de apresentar sucesso.

O formulário preserva motivo, escolha, revisão e UUID quando a resposta não chega. Somente após recibo validado e cadastro conferido ele limpa o motivo e prepara uma nova intenção. A mensagem de sucesso desaparece quando uma nova edição começa. Em conflito, a orientação é recarregar e conferir o cadastro.

A transação tranca os perfis do calculista/dono, cliente, pedidos e pagamentos em ordem estável; integra a guarda existente de fila/documentos. Registro privado imutável, revisão, transições, auditoria e avisos são atômicos. Falha no último aviso reverte todas as alterações.

## Permissões e migrations

Migrations locais versionadas:

- `0043_client_contract`: revisão, histórico privado com RLS, RPCs e proteção das colunas comerciais.
- `0044_contract_reason_trim`: normalização completa do motivo e constraint correspondente.
- `0045_payment_order_immutable`: impede transferir qualquer pagamento, inclusive legado/pendente, para outro pedido. A validação não adiciona locks e preserva a atualização de status.

`service_role` recebe INSERT/UPDATE apenas nas colunas cadastrais permitidas de `clients`; não pode gravar `has_contract` ou `contract_revision`. Cliente/admin/anônimo não executam a alteração. Nenhum papel da aplicação tem grants diretos no histórico privado. A leitura do painel retorna contexto de até cinquenta clientes da página, com a última alteração e indicação de que a condição pode ser retirada.

Os testes usam exclusivamente o Supabase local do André e dados inventados. A preparação das amostras usa o proprietário do PostgreSQL local, separada da ação de negócio: não libera pedidos de amostras anteriores e restaura condição/revisão originais. A limpeza remove apenas UUIDs pertencentes ao ensaio.

Evidências e comandos: [clientes com contrato](evidencias/clientes-com-contrato/README.md). O andamento do projeto fica exclusivamente em `plan.md`.

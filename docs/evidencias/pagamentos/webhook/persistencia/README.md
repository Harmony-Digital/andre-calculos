# Persistência local do webhook

Migrations 99 e 100 acrescentam evento original, conflitos imutáveis e fila privada. A origem fica ligada ao scope da conta fictícia e ao ID do evento; RPC de sistema relê modo, ambiente, conta e marker local. Todos os registros usam RLS e grants mínimos. Usuários autenticados e anônimos não podem chamar a RPC nem acessar as tabelas.

A recepção confere token e conta, elimina atributos privados e só retorna HTTP 200 depois da gravação. Não aplica crédito, não registra pagamento e não modifica a fila do André. O endpoint fica indisponível fora do perfil local ou sem configuração. O driver e a autenticação da conta real pertencem a M3.01c4.

Um mesmo ID com dados equivalentes conserva a primeira origem e sua auditoria. Dados diferentes geram conflito durável, mudam a fila para conciliação e incrementam a revisão, retirando o lease de um worker anterior. Repetir o conflito não repete auditoria nem muda a origem. A ordem dos locks é evento antes de fila; M3.01c3 deverá conservar essa ordem e conferir a revisão ao finalizar.

A migration 99 foi aplicada e permanece intacta. Um ensaio adicional demonstrou que converter o texto para JSONB reescrevia `12501e-2` como `125.01`, alterando a recusa lexical do contrato financeiro. A migration 100 conserva o texto mínimo validado; JSONB serve à comparação semântica. Chaves duplicadas são recusadas no banco também. O caso preserva a recusa do normalizador antes e depois da persistência, sem arredondamento ou nova interpretação de dinheiro.

Os 25 testes focados de banco passaram em 31,87 s após a correção. Um caso adicional executou a rota pelo servidor Next próprio, em porta efêmera: GET 405, token inválido 401, POST 200 após commit, replay e conflito. Esse caso passou separadamente em 3,79 s; 25 casos foram excluídos pelo filtro de nome. A resposta perdida após commit recebeu 503, e o retry reutilizou a origem existente. Falhas de auditoria reverteram evento, fila e conflito.

Os 14 testes próprios de contrato HTTP e 49 focados, incluindo a recepção anterior, passaram. Formato, lint, tipos, 1.490 unidades em 74 arquivos e 43 testes de scripts passaram; o build local mantém EPERM do Turbopack. Depois do foco: 100 migrations, 25 tabelas públicas e 59 privadas com RLS, quatro perfis, nenhum evento de webhook residual e controles financeiros iguais ao baseline. Ambos os advisors após cada migration não encontraram problemas.

A suíte geral de banco está separada dessas provas focadas. A fonte e o build exato, o resultado geral e a limpeza final serão registrados no plano e nos arquivos de evidência.

O teste usa apenas configuração efêmera de `ANDRE_WEBHOOK_FIXTURE_SCOPE_ID`, `ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID` e `ANDRE_WEBHOOK_FIXTURE_TOKEN`. Não há token, API Key ou configuração de conta real no repositório. Não foi publicado endpoint nem configurado webhook externo.

Referência de validação das chaves: [SQL/JSON no PostgreSQL 17](https://www.postgresql.org/docs/17/functions-json.html).

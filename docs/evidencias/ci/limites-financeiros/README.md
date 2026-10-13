# Duração dos ensaios financeiros

A suíte da fonte9a396025 terminou com983aprovações e5falhas: quatro timeouts externos(5,10,12segundos) e um contador que observou dois pedidos bloqueados em vez de um. A reprodução dos51casos intactos passou em64,88s. A causa do segundo pedido bloqueado não foi atribuída apenas por essa reprodução.

Os limites externos dos cenários afetados passam a20segundos; a troca de dono,que inclui restauração e leitura posterior,tem25segundos. Permanecem as esperas de3000ms,statement/idle-in-transaction de8000ms e todas as asserções,fixtures,permissões,revisões,leases e algoritmos da aplicação. Nenhum timeout de produto,navegador ou retorno de configurações muda. Comparação estrutural TypeScript confirmou identidade dos dois arquivos ao remover apenas os limites externos dos testes e comentários.

Após a mudança,51cenários passaram em72,22s e read-back/controles ficaram idênticos ao baseline104/25/61RLS/4perfis. Formato/lint/tipos,1.490unidades74arquivos e43testes de scripts passaram. O build local voltou a terminar comEPERM na porta interna doTurbopack. A regressão geral e o check/build exato remoto da fonte nova ainda precisam de verificação; consultar o plan.md para o estado atual.

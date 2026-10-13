# Contrato privado da fatura — M3.01ap

Parser exclusivo do servidor, somente fixture/deposit. Valida envelope e identificadores contra o esperado; não prova autorização, identidade da conta, transporte ou pagamento. Apenas estado ativo admite URL sandbox conferida, sem credenciais/query/fragmento. Pagamento, bloqueio e conciliação não carregam URL; valor desconhecido permanece nulo. A URL é um dado da resposta privada, não uma evidência registrada.

25 novos testes/209 focados aprovados;1417 gerais em70arquivos e43 scripts,formato/lint/tipos passaram. Build local falhou com EPERM ao abrir porta interna do Turbopack; confirmação do check/build exato depende do CI.

Os JSONs preservam SHA-256 dos logs originais locais e dos extratos selecionados. M3.01aq/ar/K e condições externas continuam abertas.

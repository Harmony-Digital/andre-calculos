# Recepção local de webhook do Asaas

Contrato somente servidor em `webhook-reception.ts`, com 35 casos próprios e 285 casos de regressão em quatro arquivos. A configuração confiável escolhe conta e ambiente; o token do header é comparado por digests SHA-256 em tempo constante. Credencial inválida e configuração ausente são recusadas antes de ler o corpo. Outra conta declarada é recusada. A recepção não confirma dinheiro nem responde HTTP 200: journal e endpoint pertencem a M3.01c2.

O stream é limitado a 1 MiB antes da acumulação, com prazo total de cinco segundos e UTF-8 estrito, inclusive entre fragmentos. O parser existente conserva decimais como tokens e recusa chaves duplicadas. Content-Length não substitui o limite real. Corpo já ocupado e falhas de leitura usam erro fixo, sem ecoar entrada ou token.

A projeção mínima preserva IDs, tipo e data do evento e os campos financeiros necessários. Descarta contato, descrição, cartão, token, URL privada e prova de fixture fornecida pelo evento. Preserva ausência, null e array vazio; tipo futuro de evento permanece disponível à futura reconciliação. Os testes comparam a normalização financeira antes e depois da sanitização para recebimento, estorno concluído ou pendente, disputa e evento desconhecido. No limite monetário seguro, o último centavo continua exato.

Formato, lint, tipos, 1.476 testes unitários em 73 arquivos e 43 testes de scripts passaram. O build local mantém EPERM do Turbopack ao criar processo e porta para CSS de react-pdf; conclusão da tarefa requer build desta fonte no CI. Nenhuma migration, endpoint, credencial real, despacho ou publicação foi criado nesta parte.

Fontes oficiais consultadas em 2026-10-12: [recepção](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook), [idempotência](https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks) e [eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas).

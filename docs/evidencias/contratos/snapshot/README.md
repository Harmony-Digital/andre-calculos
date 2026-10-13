# Snapshot contratual no aceite (M3.04a)

A migration107 captura a identificação efetivamente lida, a proposta, os textos e o recibo na transação do aceite. Dois registros privados com RLS associam o snapshot/SHA à intenção única de geração. Replays não substituem os dados. Falha na captura ou intenção reverte o aceite inteiro.

O preenchimento de aceites anteriores usa somente contexto e recibo congelados. Nome, documento e contato não registrados ficam nulos, com origem `legacy`; o perfil atual não completa o passado. IP e user-agent continuam exclusivamente no recibo privado existente, sem serem replicados pelo getter.

O getter exige sessão de proprietário ou calculista e recusa proposta não aceita, simulada, recusada, outro cliente, admin, anônimo e serviço. Os testes usam dados declaradamente fictícios; fixtures/intenções/snapshots/faults são removidos ao final.

Evidências: `verificacao-local.json`, logs focados, read-back, controles e advisors. A geração/arquivamento do PDF, estados, telas e download auditado são os próximos componentes previstos em M3.04b/c/d. O build local encontrou EPERM no processo interno do Turbopack. A fonte24b9d7f passou no check/build69; checkout/pais/árvore/lock/config/inventário conferidos em `ci69-build.json`. A execução geral conserva resultado próprio.

# Página indisponível em português

Evidência de M3.01c3c3d1. Andamento canônico somente no `plan.md`.

A revisão visual de c2 mostrou a página 404 padrão em inglês. `not-found.tsx` usa a marca, os tokens e as fontes existentes, com mensagem genérica e links fixos para `/entrar` e `/`. Não consulta conta, processo ou parâmetros nem altera `notFound()`, autorização, SQL ou pagamentos.

Quatro testes em 375/1440 px passaram em 17,1 s, sem retries: caminho inexistente e proposta sem contexto, recusas de outro cliente, navegação real por teclado, status 404, idioma, Axe e largura. Dez capturas inspecionadas visualmente, com texto e links legíveis e sem sobreposição observada. Banco, controles e grants idênticos ao baseline106; ambos os advisors sem achados.

Formato, lint, tipos, 1.494 testes unitários em 75 arquivos e 43 testes de scripts passaram. O build local foi impedido por EPERM ao abrir a porta interna do Turbopack; o check/build exato requer o CI desta fonte. Regressão e consolidação restantes de d, causas f/g, sandbox externo e objetivo integral conservam comprovações próprias.

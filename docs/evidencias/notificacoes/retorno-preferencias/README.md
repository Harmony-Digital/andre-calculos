# Retorno das preferências de aviso

Tarefa M2.35f. Somente banco local e pessoas fictícias.

## Falhas observadas

- CI57, fonte `d5755a1`: a primeira gravação de E-mail para Nova mensagem deixou o status vazio durante a asserção original de 5 segundos. O retry passou.
- CI58, fonte `95506a1`: o mesmo teste excedeu os 90 segundos. A tentativa de remover rotas de uma página já fechada substituiu o erro principal e impediu a limpeza do contexto, da sessão e do processo que vinham em seguida. A etapa que consumiu o tempo não foi registrada. O retry passou.

Os logs e os metadados de ambas as falhas estão nesta pasta. Não há evidência de que elas tenham a mesma causa.

## Reprodução original

Comando: `CI=true bash scripts/dev-env.sh npm run test:e2e -- tests/e2e/notification-preferences.spec.ts --workers=1 --retries=0`.

Os dois testes passaram em 1,5 minuto, com 375 e 1440 pixels, na fonte de aplicação `e66c1a0`, antes das alterações de diagnóstico. O teste original permaneceu intacto: asserções de 5 segundos e limite de 90 segundos. O log normalizado e seu hash original estão em `repro-original.log` e `repro-original.json`. Não foi preservada captura do formulário da reprodução original.

A passagem isolada não encerra a investigação nem atribui uma causa às falhas do CI.

## Diagnóstico e limpeza

O teste registra a etapa atual e observa somente o POST correspondente à tentativa, comparando o requestId em memória. Em caso de erro, emite somente status HTTP, início/fim/falha da requisição, tempo, revisão, opção, estado desabilitado, mudança do identificador, presença da mensagem de sucesso e existência do recibo. Faz uma captura limitada ao formulário quando a página ainda está disponível.

Não exporta corpo de requisição/resposta, cookies, headers, tokens, contatos, identificadores de pessoas ou o requestId. A consulta de diagnóstico e as operações no formulário têm limite próprio de 1 segundo; nenhum limite ou asserção do percurso comercial foi ampliado.

A limpeza tenta rotas, contexto, sessão, processo e fixture separadamente. Havendo falha principal, ela é preservada; os nomes dos recursos cuja limpeza falhou são relatados. Se a jornada passou e a limpeza falha, o teste falha também. Quatro testes unitários verificam falhas múltiplas, preservação da identidade do erro e recusa de sucesso com limpeza incompleta.

Um ensaio controlado separado verifica o relatório sem conteúdo privado e a continuidade da limpeza depois de fechar uma página real. Ele não reproduz nem explica as falhas originais.

## Limite da conclusão

A evidência reunida não demonstra a causa real da intermitência. Nenhuma alteração funcional foi feita no formulário ou na ação do servidor. O andamento da tarefa está no `plan.md`.

## Verificação desta preparação

- Quatro testes de navegador passaram em 1,3 minuto, sem retries: dois percursos originais e dois ensaios controlados, em 375/1440 px. O percurso original conserva todos os valores, asserções e limites. Axe e largura foram verificados pelo mesmo percurso.
- As quatro capturas desta execução foram arquivadas com hashes e inspecionadas visualmente. As capturas controladas mostram somente o formulário fictício de diagnóstico.
- O read-back e os controles finais são idênticos aos anteriores da fonte `e66c1a0`: 106 migrations, 25 tabelas públicas e 61 privadas com RLS, quatro perfis e marcador financeiro desativado. Advisors de segurança e desempenho sem achados.
- `npm run check`: formato, lint, tipos, 1.494 testes unitários em 75 arquivos e 43 testes de scripts passaram. O build local falhou pela restrição EPERM ao abrir uma porta interna do Turbopack; a fonte exata precisa de confirmação do build no CI. A falha foi preservada, sem troca de bundler ou ajuste de permissões.

Após restringir a validação do UUID e proteger a criação do contexto no ensaio controlado, os dois ensaios controlados foram repetidos na fonte final: 2 passed em 2,8 segundos, sem retry. Read-back final idêntico ao anterior. Tipos e `npm run check` repetidos: mesmas etapas aprovadas e mesma restrição EPERM no build. Logs finais preservados nesta pasta.

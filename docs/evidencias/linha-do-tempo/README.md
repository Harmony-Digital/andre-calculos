# Verificação local da linha do tempo

Ensaio em 2026-10-11 no Supabase local exclusivo do André. Usuários, processos, notas e atividades são inteiramente fictícios.

- `bash scripts/dev-env.sh npm run check`: formatação, lint, tipos, 255 unitários e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls`: 43 aprovados, incluindo seis ensaios das notas e da imutabilidade dos eventos.
- `bash scripts/dev-env.sh npm run test:e2e -- --workers=4`: 59 aprovados; cinco ensaios únicos omitidos só no celular. Os dois cenários de linha do tempo passaram em 375 e 1440 px.
- Migrations locais 0016–0017; SQL lint e advisors de segurança/desempenho sem achados.
- Ao final, dados profissionais e aprovações legais vazios como antes dos testes; zero preços ativos, zero processos temporários de mensagens/notas e papel do calculista fictício restaurado.

O filtro por tipo é aplicado no banco antes do limite de cem atividades. A paginação conserva o tipo escolhido e usa timestamp original com microssegundos e UUID como desempate. O ensaio criou 112 notas antigas e 105 uploads mais recentes, recuperou todas as notas e todos os uploads e confirmou que trocar o tipo reinicia a paginação. Tipo ou cursor inválido retorna 404.

Só o calculista registra notas. O cliente do processo as lê com nome do autor e data, sem formulário de edição. Texto digitado como HTML aparece literalmente, sem executar script. Erro de validação preserva texto e chave; envio concluído limpa o formulário. Axe e largura passaram nas duas telas; as capturas foram conferidas visualmente.

A RPC infere autoria da sessão, revalida papel/acesso e usa lock por chave idempotente. Duas chamadas simultâneas iguais geram um único evento e uma única auditoria. Mesma chave com outro processo, ator, tipo ou texto é recusada. Cliente B, administrador, anônimo e chamada de sistema sem ator não registram notas. Não há envio de e-mail ou WhatsApp por notas.

`private.record_event` grava eventos dentro da transação da RPC autorizada. Rascunho, upload e mensagem usam esse helper. A conferência dos privilégios confirmou ausência de EXECUTE para PUBLIC, anon, authenticated e service_role, e ausência de DELETE/TRUNCATE para authenticated. O teste de banco recusa alteração de conteúdo, autor, processo, data ou identificador; `updated_at` é o único metadado mutável. Limpeza de fixtures usa o papel de sistema somente no ambiente local explicitamente autorizado.

Capturas: [computador](atividades-computador.png) e [celular](atividades-celular.png).

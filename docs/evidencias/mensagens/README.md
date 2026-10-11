# Verificação local das mensagens

Ensaio em 2026-10-11 no Supabase local exclusivo do André. Usuários, textos, processos e PDFs são inteiramente fictícios.

- `bash scripts/dev-env.sh npm run check`: formatação, lint, tipos, 253 unitários e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls`: 37 aprovados, incluindo nove ensaios das mensagens.
- `bash scripts/dev-env.sh npm run test:e2e -- --workers=4`: 55 aprovados; cinco ensaios únicos omitidos só no celular. Os três cenários de mensagens passaram em 375 e 1440 px.
- Migrations locais 0013–0015; SQL lint e advisors de segurança/desempenho sem achados.
- Ao final, dados profissionais e aprovações legais restaurados; zero preços ativos e zero processos temporários de mensagens.

O formulário envia texto e até dez anexos confirmados da pasta Documentos do cliente. Upload mantém texto e identificador de envio. Anexo pendente recusa a mensagem sem perder o texto; erro de validação depois de um envio bem sucedido também preserva a próxima chave. A resposta do calculista aparece ao recarregar a pasta. Nomes vêm de projeção limitada aos participantes daquele processo. HTML digitado aparece como texto, sem imagem nem requisição externa. Axe e largura passaram nas duas telas.

Mensagem, vínculos dos anexos, auditoria, evento e avisos são gravados na mesma transação. Duas chamadas iguais simultâneas geram um único registro e um aviso por canal. Mesma chave com outro corpo, autor, processo ou anexo é recusada. Se a resposta é perdida depois da gravação, o navegador mantém o texto e a chave; o novo envio recupera o registro original, com uma só auditoria e um só evento.

O banco recusa anexos ausentes, duplicados, nulos, multidimensionais, acima do limite, pendentes, de outra pasta ou de outro processo. Locks ordenados cobrem todos os IDs antes da validação. Mensagem enviada e metadados dos anexos vinculados ficam imutáveis; FK impede exclusão silenciosa do arquivo. O ensaio de alteração concorrente confirma que envio e mudança incompatível de pasta não conseguem ambos vencer.

Cliente B, administrador, anônimo e chamada de sistema sem ator não enviam mensagens. Escrita direta é negada, inclusive ao calculista; RPC infere autoria do JWT. O replay revalida acesso atual. Participantes não incluem e-mail nem perfil de outro cliente. Downloads continuam privados e auditados.

A paginação usa data com precisão original de microssegundos e UUID como desempate. O teste recuperou 112 mensagens, incluindo 60 com timestamp idêntico e outras no mesmo milissegundo, sem perda ou duplicação. Cursor malformado retorna 404.

Avisos `new_message` ficam na fila com apenas os IDs de mensagem/processo. Preferências de e-mail e opt-in de WhatsApp são respeitados. O teste conferiu o destinatário da resposta e cada canal; não enviou e-mail ou WhatsApp real. Integração e despacho permanecem descritos no `plan.md`.

Capturas: [computador](conversa-computador.png) e [celular](conversa-celular.png).

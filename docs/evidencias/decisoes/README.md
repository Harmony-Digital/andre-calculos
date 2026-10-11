# Verificação local das decisões técnicas

Ensaio de 2026-10-11 no Supabase local exclusivo do André. Pessoas, processos, decisões e CRC nas capturas/PDFs são fictícios.

- `bash scripts/dev-env.sh npm run check`: formatação, lint, tipos, 259 unitários e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls`: 49 aprovados, incluindo seis cenários de decisões.
- `bash scripts/dev-env.sh npm run test:e2e -- --workers=4`: 63 aprovados; cinco ensaios únicos omitidos só no celular. Os dois cenários de decisões passaram em 375 e 1440 px.
- Migrations locais 0018–0019; SQL lint e advisors de segurança/desempenho sem achados.
- Read-back ao final: dados profissionais/aprovações legais vazios, zero preços ativos, zero processos temporários e papel do calculista fictício restaurado; 19 migrations locais.

O calculista registra parâmetro, valor, origem, página opcional e justificativa. A sessão define a autoria. Validação preserva texto/chave após erro; a RPC compara todos os campos do registro original e duas chamadas simultâneas iguais produzem uma única decisão, atividade e auditoria. Reutilizar a chave com outro conteúdo é recusado. O registro original não pode ser editado, e o replay não apaga concordância posterior.

Sem página nem concordância, o registro aparece como premissa (RN-08). Só o cliente dono do processo confirma com aceite explícito; autoria/data da confirmação são imutáveis. Calculista, outro cliente, administrador e anônimo não confirmam em seu lugar. Concordância gera atividade/auditoria uma única vez. Escritas diretas e chamadas sem ator são recusadas. O cliente lê decisões, mas não recebe o formulário de registro. Texto HTML é literal; axe e largura passaram nas duas telas.

O PDF exige sessão, acesso ao processo e nome/CRC/UF/categoria profissional configurados. Sem os dados profissionais retorna 409; outro cliente, administrador e anônimo recebem 404. O banco produz um snapshot de todas as decisões, sem depender do limite de linhas do PostgREST e sem incluir Pix/contatos/configurações comerciais. A auditoria `decisions_pdf_access` registra acesso autorizado antes da geração, portanto representa a tentativa, não a conclusão do download. Resposta `application/pdf`, `private, no-store`, sem links assinados nem scripts.

Foram renderizados e conferidos visualmente um documento de uma página e todas as seis páginas do ensaio longo. Os testes extraem todas as 12 frases finais, conferem sequência/total dos rodapés, limites das palavras em A4 e valor de mil caracteres sem inserção de hífens. Fontes Source Sans 3 WOFF são locais e constam no trace do build. Remover `lineHeight` herdado da página corrigiu o rodapé dinâmico, também reproduzido em documento mínimo fora do Next.js. Os PDFs são registros técnicos sem assinatura e não substituem o parecer do André.

Capturas: [computador](decisoes-computador.png), [celular](decisoes-celular.png) e [PDF renderizado](pdf-ficticio.png). Amostras fictícias: [uma página](decisoes-ficticias.pdf) e [seis páginas](decisoes-ficticias-varias-paginas.pdf).

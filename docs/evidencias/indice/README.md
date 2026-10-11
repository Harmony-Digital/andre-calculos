# Verificação local do índice de páginas

Ensaio de 2026-10-11 no Supabase local exclusivo do André. Usuários, PDFs, processos e referências são inteiramente fictícios.

- `bash scripts/dev-env.sh npm run check`: formatação, lint, tipos, 263 unitários e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls`: 55 aprovados, incluindo seis cenários específicos do índice.
- `bash scripts/dev-env.sh npm run test:e2e -- --workers=4`: 67 aprovados; cinco ensaios únicos omitidos só no celular. Os dois cenários do índice passaram em 375 e 1440 px.
- Migrations locais 0020–0022; `supabase db lint --local` e `supabase db advisors --local --type all` sem achados.
- Read-back: dados profissionais/aprovações legais vazios, zero preços ativos e papel calculista restaurado. Dois processos fictícios de ensaios que excederam tempo foram removidos pelo helper restrito; read-back confirmou zero processos temporários e zero recibos. Vinte e duas migrations locais.

O calculista escolhe um PDF confirmado da pasta Processo ou Documentos do cliente e registra tipo de peça, páginas e observação. O cliente lê sem receber formulários. Ensaio enviou dois PDFs reais fictícios por TUS, distinguiu versões 1/2, criou uma referência na versão 1, editou e removeu sem alterar a versão 2. HTML foi exibido como texto; axe e largura passaram. Cada campo usa identificador de renderização independente da chave da operação, evitando colisão ao acrescentar o registro recém-criado à lista.

As páginas são posições físicas, começando em 1; a numeração impressa pode ser diferente. Gramática aceita inteiros/intervalos crescentes até 100.000, cem referências e mil caracteres, sem expandir intervalos gigantes. Observação aceita até dois mil caracteres. A quantidade real de páginas não é usada como limite: o formulário declara isso, e não há contagem confiável gravada pelo upload nesta etapa.

RPC infere o ator e exige calculista com acesso ao processo. Escritas diretas, outros clientes, administrador, anônimo e chamada de sistema sem ator são recusados. Arquivos pendentes, de outro processo, não PDF ou indisponíveis são recusados. Identidade da referência é imutável; a identidade/conteúdo/versão de PDF já indexado exige novo arquivo para mudar.

Locks seguem arquivo `FOR SHARE` e depois entrada `FOR UPDATE`; revisão impede perda silenciosa. Recibo privado imutável compara ator/processo/payload normalizado e conserva o resultado após editar ou apagar a entrada e depois apagar o arquivo. CRUD, recibo, evento e auditoria confirmam juntos. Repetir a tentativa não duplica atividades; mudar seu conteúdo é recusado e a tela pede recarregamento. Recibos são removidos junto com o processo, preservando a garantia de reenvio durante seu ciclo de vida.

Conflito de revisão retorna `PT409`, sem retries de serialização. O ensaio inicial com `40001` excedeu tempo: [Supabase documenta os retries e recomenda códigos de negócio próprios](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). A migration 0021 também corrige escopo de variáveis e inicialização de array encontrados pelo SQL lint; arquivos de migrations já aplicadas foram preservados.

Paginação recuperou todas as 61 referências, inclusive empates exatos e no mesmo milissegundo, em páginas de cinquenta. Cursor inválido retorna 404. Uma segunda sessão tentou salvar revisão antiga: recebeu conflito, com campos/chave preservados. A versão nova começa sem cópia automática do índice.

Capturas conferidas: [calculista no computador](indice-calculista-computador.png), [calculista no celular](indice-calculista-celular.png), [cliente no computador](indice-cliente-computador.png) e [cliente no celular](indice-cliente-celular.png).

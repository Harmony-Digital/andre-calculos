# Inventário do build — coleta de M2.35a

O coletor `scripts/inventariar-build.mjs` prepara um relatório sanitizado imediatamente após `npm run check` e `next build` bem-sucedidos no job qualidade. Não usa a pasta `.next/dev` local como prova do build remoto.

O relatório identifica a fonte do PR e o checkout testado, com hashes do lock, `next.config.ts` e `BUILD_ID`. A CLI confere o checkout real pelo Git; a fonte deve ser esse commit ou um dos pais diretos do merge testado. A configuração do CI fornece os SHAs esperados, sem aceitar valores de requisição HTTP.

Os arquivos NFT são interpretados pelo mapper da versão fixada Next.js 16.4. São conferidos `files`, alinhamento de `fileHashes`, índices de `symlinks` e `additionalRoots`, conforme a [documentação oficial de output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output). O uso dessa API interna deve ser reconferido quando Next mudar de versão.

O JSON exporta somente:

- SHA da fonte/checkout, versão Next/Node e hashes dos arquivos de configuração;
- path relativo permitido/hash/contagem dos traces e dos JS de `.next/server`/`.next/static`, incluindo bundles Edge dentro do servidor;
- versões declaradas dos cinco pacotes no lock, contagem de referências no trace e arquivos com marcador de caminho de pacote;
- contadores de cobertura incompleta para extensões desconhecidas, referências externas/ausentes e symlinks não resolvidos.

Nenhum código, ambiente, conteúdo de arquivo, trace bruto, source map ou path absoluto é exportado. `.next/dev`, cache, build, types e standalone são excluídos do inventário; o coletor examina os outputs de produção originais, sem duplicar a cópia standalone. Symlinks de artefatos não são seguidos para ler conteúdo. Caminhos em next/dist/compiled são candidatos incorporados separados das referências ao pacote original; sua versão permanece indeterminada, sem herdar a versão do lock.

Validação local em 2026-10-11:

- Dez testes de fixtures fictícias aprovados: determinismo/privacidade, raiz adicional/symlink, extensão desconhecida, referência externa/ausente, metadados inválidos, build parcial/dev, caminho indireto externo e identidade real da CLI e falha de carga do Next. Alvos declarados externos/ausentes/divergentes, symlinks entre raízes e candidatos incorporados ao Next foram conferidos.
- `npm run check`: formato/lint/tipos, 403 unitários e 22 testes de scripts aprovados. O build local encontra a restrição da porta interna do Turbopack; coleta real depende do CI da nova fonte.
- Fixtures temporárias limpas pelos testes; nenhum banco, cliente ou processo real utilizado.

`traceCoverageComplete` descreve somente a resolução dos metadados examinados. Referência no trace não comprova execução nem explorabilidade; marker de caminho é candidato de atribuição, sem provar versão ou função incorporada. Nenhum path/marker encontrado não exclui código minificado sem identificação.

A busca de markers examina somente os JS em .next/server e .next/static; não examina código de dependências externas dos traces nem source maps.

O inventário do CI também não atesta equivalência ao deploy Vercel da main 9a25f31. Advisory, correção compatível/reclassificação oficial e revisão integral M2.35 permanecem abertos no plan.md. O artefato `inventario-dependencias` contém apenas esse JSON e tem retenção de sete dias; não publicar a pasta `.next`.

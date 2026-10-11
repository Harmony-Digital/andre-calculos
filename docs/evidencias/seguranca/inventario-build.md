# Inventário do build — coleta de M2.35a

O coletor `scripts/inventariar-build.mjs` prepara um relatório sanitizado imediatamente após `npm run check` e `next build` bem-sucedidos no job qualidade. Não usa a pasta `.next/dev` local como prova do build remoto.

O relatório identifica a fonte do PR e o checkout testado, com hashes do lock, `next.config.ts` e `BUILD_ID`. A CLI confere o checkout real pelo Git; a fonte deve ser esse commit ou um dos pais diretos do merge testado. A configuração do CI fornece os SHAs esperados, sem aceitar valores de requisição HTTP.

Os arquivos NFT são interpretados pelo mapper da versão fixada Next.js 16.4. São conferidos `files`, alinhamento de `fileHashes`, índices de `symlinks` e `additionalRoots`, conforme a [documentação oficial de output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output). O uso dessa API interna deve ser reconferido quando Next mudar de versão.

O JSON exporta somente:

- SHA da fonte/checkout, versão Next/Node e hashes dos arquivos de configuração;
- path relativo permitido/hash/contagem dos traces e dos JS de `.next/server`/`.next/static`, incluindo bundles Edge dentro do servidor;
- versões declaradas dos cinco pacotes no lock, contagem de referências no trace e arquivos com marcador de caminho de pacote;
- contadores de cobertura incompleta para extensões desconhecidas, referências externas/ausentes e symlinks não resolvidos.

O diagnóstico adicional preparado localmente identifica os motivos `artifact_symlink_skipped`, `trace_resolution_failed`, `declared_symlink_mismatch` e `undeclared_symlink`. Para artefatos, exporta somente o path relativo filtrado; para NFT, somente path do trace, índice da entrada e, quando aplicável, referência `source`/`declared_target`. Não exporta alvo do link, path de dependência ou erro bruto, e não remove a cobertura incompleta.

Nenhum código, ambiente, conteúdo de arquivo, trace bruto, source map ou path absoluto é exportado. `.next/dev`, cache, build, types e standalone são excluídos do inventário; o coletor examina os outputs de produção originais, sem duplicar a cópia standalone. Symlinks de artefatos não são seguidos para ler conteúdo. Caminhos em next/dist/compiled são candidatos incorporados separados das referências ao pacote original; sua versão permanece indeterminada, sem herdar a versão do lock.

Validação local em 2026-10-11:

- Dez testes de fixtures fictícias aprovados: determinismo/privacidade, raiz adicional/symlink, extensão desconhecida, referência externa/ausente, metadados inválidos, build parcial/dev, caminho indireto externo e identidade real da CLI e falha de carga do Next. Alvos declarados externos/ausentes/divergentes, symlinks entre raízes e candidatos incorporados ao Next foram conferidos.
- `npm run check`: formato/lint/tipos, 403 unitários e 22 testes de scripts aprovados. O build local encontra a restrição da porta interna do Turbopack; coleta real depende do CI da nova fonte.
- Fixtures temporárias limpas pelos testes; nenhum banco, cliente ou processo real utilizado.

Coleta real conferida no [CI38169457310](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38169457310), job qualidade `114558800055` aprovado:

- Fonte `b1a201fb02dc51bb33aa62f32a97970f2f315936`, checkout `45adaf532b1b5698cfcfeb2fcfe80af5ff6ade9e`; a API Git confirmou pais `9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd` e a fonte do PR.
- `npm run check` completo: 403 unitários, 22 scripts, formato/lint/tipos e build aprovados; Next.js 16.4.0 e Node v22.23.3.
- 35 traces e 300 arquivos JS inventariados. Zero referências diretas/incorporadas ou markers identificáveis dos cinco pacotes; versões incorporadas permanecem indeterminadas.
- `traceCoverageComplete: false`: zero campos desconhecidos, referências externas ou ausentes; um symlink não resolvido. O artefato não identifica seu caminho, portanto não permite concluir seu alcance nem eliminar essa lacuna.
- Hashes do lock e configuração comparados aos bytes da fonte no Git. JSON preservado byte a byte em [build-dependencies-b1a201f.json](build-dependencies-b1a201f.json), SHA-256 `a6d68e8db302aa423d68e6a9e1f4693fd9cce7e7a8c7c94b181c564db800af1a`.

A coleta é evidência parcial de alcance. A suíte geral desse CI terminou com sucesso: 315 testes de banco, 153 e2e/sete omissões apenas no projeto celular e advisors locais de segurança/desempenho sem achados. PR #8 pronto para revisão na fonte b1a201f; o diagnóstico adicional pertence à fonte seguinte, sem alterar esse resultado.

O diagnóstico adicional passou em treze testes próprios e 25 testes de scripts locais. Três fixtures novas cobrem artefato symlink de arquivo/diretório sem seguir o alvo, falha de resolução por ciclo e symlink físico omitido dos metadados; a fixture existente também confere o motivo para destino divergente. Revisão independente estática sem bloqueadores. Nova coleta conferida no job qualidade 114562860596 do [CI38170815863](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38170815863), fonte `03b4d778c8cc924ff2a3a25dd04911fb85e7899c`, checkout `b8e3e3f23270967588d3a8df2076f2e180f49dff`, cujos pais são main9a25f31 e essa fonte. Lock/configuração comparados aos bytes Git; 411 unitários/25 scripts e build aprovados.

O novo relatório mantém 35 traces/300 JS, zero referências/marcadores dos cinco pacotes e cobertura incompleta por um artefato symlink ignorado: `.next/node_modules/@react-pdf/renderer-5f716e9bc7d68b8a` (`artifact_symlink_skipped`). Não leu nem exportou o alvo. Esse diagnóstico identifica a ocorrência neste novo build; não prova a origem do contador no artefato anterior, ausência de vulnerabilidade ou equivalência à Vercel. O JSON está preservado byte a byte em [build-dependencies-03b4d77.json](build-dependencies-03b4d77.json), SHA-256 `bbd1785d9bfb231ec8b1877652c50cc6ad2539bd3bf114e9fa2a62011d019f11`. Suíte geral dessa nova fonte em execução.

`traceCoverageComplete` descreve somente a resolução dos metadados examinados. Referência no trace não comprova execução nem explorabilidade; marker de caminho é candidato de atribuição, sem provar versão ou função incorporada. Nenhum path/marker encontrado não exclui código minificado sem identificação.

A busca de markers examina somente os JS em .next/server e .next/static; não examina código de dependências externas dos traces nem source maps.

O inventário do CI também não atesta equivalência ao deploy Vercel da main 9a25f31. Advisory, correção compatível/reclassificação oficial e revisão integral M2.35 permanecem abertos no plan.md. O artefato `inventario-dependencias` contém apenas esse JSON e tem retenção de sete dias; não publicar a pasta `.next`.

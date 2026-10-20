# Versões do PDF e páginas lidas

Na pasta do processo, André abre **Índice → Conferir versões e páginas lidas**. O fluxo usa conferência humana explícita. Abrir o visualizador ou avançar páginas não registra leitura, e nome igual, número de página ou hash não confirmam correspondência entre versões.

## Fluxo

1. Envie o novo PDF pela aba **Documentos**, em Processo ou Documentos do cliente. Cada envio mantém bytes, hash e identificação próprios.
2. Na conferência de versões, selecione o arquivo pela identificação exibida junto ao nome. Confira a quantidade de páginas no visualizador e declare essa quantidade. Ela é uma declaração do calculista, não uma contagem extraída pelo servidor.
3. Para o primeiro PDF, escolha **Primeiro PDF desta sequência**. Nos seguintes, escolha explicitamente a última versão conferida da mesma sequência e processo. Uma versão admite um sucessor; outros documentos podem iniciar sequências independentes.
4. Use **Marcar ou desmarcar páginas lidas** para registrar posições como `1-4, 8`. Uma marcação explícita no PDF atual prevalece sobre leitura herdada.
5. Compare o PDF anterior e o atual. Registre pares `anterior:atual`, por exemplo `3:1, 1:3, 4:4`, somente quando o conteúdo correspondente não mudou. Confirme manualmente os pares.
6. Reaproveite uma referência da versão anterior somente quando **todas** as suas páginas tiverem correspondência confirmada. As páginas de destino são calculadas no servidor; tipo e observação vêm do snapshot da referência original.
7. Consulte a aba **Índice** nas duas visões. A cópia mostra arquivo/páginas/revisão de origem, responsável e data. A entrada antiga permanece intacta.

A sequência exibida nas duas visões vem do vínculo explícito entre PDFs; os metadados originais de upload não são reescritos. O conteúdo e a identidade de um PDF registrado ficam protegidos contra alteração. A contagem declarada é conservada com sua autoria e data; um PDF diferente exige outro envio e registro.

## Páginas pendentes e correções

Páginas sem correspondência ficam identificadas como **novas, alteradas ou ainda não conferidas**, sem atribuir automaticamente uma dessas causas. Páginas anteriores sem destino também conservam a incerteza; não são declaradas removidas pelo sistema.

A leitura herdada captura a situação da página anterior no momento da confirmação. Uma marcação direta posterior no PDF atual pode deixá-la lida ou pendente. A alteração posterior da marcação no documento anterior não reescreve essa prova histórica.

Para corrigir uma correspondência, informe o novo par; use `0:2` para retirar a confirmação da página atual 2. Uma página anterior não pode ocupar dois destinos. Para uma troca, inclua todos os destinos afetados no mesmo comando ou retire o vínculo antigo antes de criar outro.

As cópias não são alteradas silenciosamente. Se a correspondência usada por uma referência mudou, o índice exibe **Reconfira esta referência antes de usar**. Corrija o mapa e confira a entrada pelo editor existente. A origem continua preservada mesmo que a referência original seja editada ou excluída; uma entrada copiada e depois editada informa essa condição.

## Proteções e limites

- Registro, leitura, correspondências e cópia exigem calculista. Cliente proprietário consulta o índice e a proveniência; outro cliente, admin e anônimo não ganham acesso ao processo.
- UUID e recibo protegem o reenvio. Após resposta incerta, preserve os campos e repita a mesma tentativa; mudar os campos com a mesma chave é recusado. Conflitos de revisão pedem recarregar, sem apagar o formulário.
- Estado do formulário, confirmação e chave são separados por arquivo; a troca de PDF não reutiliza uma tentativa de outro documento.
- As quatro tabelas do fluxo são privadas, com RLS e sem DML para usuários. As RPCs projetam somente os campos necessários; a interface não recebe caminho de Storage, token ou payload bruto do snapshot.
- Páginas usam posições físicas a partir de 1. A declaração aceita até100.000 páginas; a tela pagina de50 em50. Marcação aceita até500 páginas e correspondências até100 pares por comando. Cópias conservam o limite do índice de100 referências/1.000 caracteres, com até500 páginas expandidas por operação; referências maiores devem ser divididas.
- O editor normal também respeita a quantidade declarada de PDFs conferidos. PDFs ainda sem conferência conservam o comportamento anterior. Registro e editor serializam a conferência desse limite.
- Evento e auditoria são transacionais. Decisões técnicas, concordâncias do advogado, contratação, pagamentos e entregas não são copiados nem acionados por esse fluxo.

## Verificação dirigida

Com o runtime local exclusivo ativo, a partir da raiz:

```sh
bash scripts/dev-env.sh npm run test:rls -- tests/integration/pdf-versions.test.ts tests/integration/page-index.test.ts
bash scripts/dev-env.sh npm run test:e2e -- tests/e2e/pdf-versions.spec.ts --workers=1 --retries=0
```

O navegador cria PDFs fictícios `A,B,C,D` e `C,X,A,D`, envia-os pela interface, cria índice, marca leitura, confirma reordenação, reaproveita referências, corrige um mapa e confere a origem nas duas visões. As fixtures são limpas ao terminar. Não executar com outro escritor do banco. Status, condições da implementação local e validação definitiva do André ficam exclusivamente em [plan.md](../plan.md#onde-estamos).

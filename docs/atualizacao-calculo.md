# Atualização de cálculo a partir do PJC

Na pasta do processo, o advogado abre **Resumo**, escolhe um pedido entregue e usa **Solicitar atualização**. Seleciona o PJC da entrega liberada ou registra **PJC ausente — solicitar envio**. A operação cria outro pedido na mesma pasta: não altera nem move os arquivos, a contratação ou os pagamentos anteriores.

O checklist anterior aparece como rascunho identificado. Tipo de cálculo fica em Atualização; data-base e ciência da intimação começam vazias, urgência começa desmarcada. O advogado revisa as nove etapas, informa data-base posterior à anterior e confirma a revisão antes de gerar a proposta. Revisão antiga deixa de valer se as respostas forem alteradas. A proposta usa a tabela ativa e tem seus próprios identificadores, valores e contratação; não recebe aceite, sinal ou crédito de outro pedido.

Se o PJC estiver ausente, a pasta registra a pendência e prepara aviso local ao André, respeitando preferências e configuração de notificações. O advogado envia o arquivo privado na seção de origem e confirma o vínculo. Só é aceito um upload próprio, confirmado, posterior à abertura, na mesma pasta e sem vínculo com outro pedido. O envio pode acontecer antes ou depois da revisão do checklist: a ação consulta a revisão atual no servidor e mantém a guarda contra alteração concorrente. O arquivo passa a ser protegido contra alterações. O envio não substitui nem se apresenta como uma entrega anterior do André.

O calculista consulta a origem no Resumo e na proposta. O download usa a autorização e a auditoria existentes. Índice e decisões continuam na pasta: na abertura são preservados snapshots de origem e as quantidades são identificadas. Não há cópia automática de concordância nem aprovação técnica nova. Alterações continuam usando os registros e revisões próprios desses módulos.

A criação tem UUID recuperável: repetir a mesma tentativa retorna o mesmo pedido. Só existe uma atualização em andamento para cada origem; em conflito, retome o pedido existente na pasta. A revisão usa o número corrente do checklist; a confirmação do PJC ausente é repetível sem duplicar o evento. Outro cliente, calculista, administrador ou anônimo não cria o pedido no lugar do proprietário.

O PJC reutilizado é entrada do novo trabalho no PJe-Calc. O portal não calcula seus valores nem gera um PJC atualizado. Depois da proposta, permanecem as regras existentes de contratação, sinal/contrato, documentos, fila, execução, revisão e entrega. Os arquivos de saída devem ser novos: o PJC anterior permanece associado à entrega original. Uma proposta fictícia não pode ser aceita como contratação real. Preços, calendário, disponibilidade, identificação e demais aprovações comerciais continuam necessários para operação real.

## Verificação dirigida

Com o runtime local do projeto saudável:

```sh
bash scripts/dev-env.sh npm run test:rls -- calculation-updates.test.ts
bash scripts/dev-env.sh npm run test:e2e -- calculation-updates.spec.ts --workers=1
```

O helper usa exclusivamente a pasta fictícia criada para o ensaio. Compara o pedido, checklist, contratação, pagamentos, entrega e arquivos anteriores antes de apagar a fixture. A limpeza remove primeiro os vínculos da atualização, preservando a restrição que impede apagar um PJC ainda referenciado.

As migrations são versionadas e novas; nunca alterar as já aplicadas para repetir um ensaio. Evidências locais ficam em `docs/evidencias/atualizacao-pjc/`. O estado corrente e os limites da entrega são mantidos somente em `plan.md`.

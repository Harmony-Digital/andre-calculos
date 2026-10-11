# Demonstração fictícia — roteiro e verificações

## Roteiro da apresentação

1. Abrir `/demonstracao` e escolher **Conhecer a área do advogado**.
2. Explorar a visão geral de Marina Duarte, personagem fictícia: processos, propostas e entregas.
3. Escolher **Solicitar orçamento**. Percorrer as nove etapas com exemplos preenchidos; mudar verbas, serviço ou urgência para ver a composição do preço.
4. Gerar a proposta: serviços discriminados, total, entrada de 50%, saldo, prazo, responsável e CRC fictício. A proposta pode ser impressa/salva como PDF pelo navegador.
5. Marcar a leitura da proposta e **Simular aceite**. Simular o sinal e anexar o documento fictício; só então o pedido entra na fila.
6. Abrir **Linha do tempo**: eventos simulados têm horário; etapas futuras não são apresentadas como fatos ocorridos.
7. Escolher **Explorar como → Calculista** e avançar análise, elaboração, revisão e entrega fictícias. Voltar à visão do advogado para explorar documentos e mensagens.
8. **Reiniciar** restaura os três exemplos originais. Os pedidos extras e mensagens ficam apenas no navegador utilizado.

## Dados e isolamento

- Marca provisória: Marco Cálculos Judiciais.
- Responsável: André Costa, personagem fictício; CRC `DEMO-000000/O`, propositalmente fictício.
- Advogada: Marina Duarte; empresas/processos/documentos inventados.
- Tabela `demo-2026-v1`, valores em centavos. Exemplo inicial de liquidação: R$ 450,00 base + duas verbas a R$ 100,00 = R$ 650,00; sinal/saldo de R$ 325,00.
- Referência temporal: 13/10/2026; suspensão fictícia em 23/10. Calendário não validado de TRT e sem utilização para prazos reais.
- Rota isolada, sem ações de servidor, banco, autenticação real, cobrança, assinatura ou notificações. Nenhum upload real é realizado.
- A demonstração não habilita os modos locais de teste nem modifica as guardas do produto. Publicação da raiz na Vercel encaminha para `/demonstracao` por redirect temporário em `app/vercel.json`.

## Evidências reproduzíveis

- `npx vitest run src/modules/demo/model.test.ts`: oito casos aprovados — totais/snapshot, adicionais, período, checklist inválido, prazo, pré-condições da fila, revisão/entrega e restauração de estado.
- `npx playwright test tests/e2e/demo.spec.ts --workers=2`: quatro casos aprovados, em 375 e 1440 px — jornada completa, recarga, mensagens, download ilustrativo, calendário, reinício, armazenamento indisponível e prazo insuficiente.
- Axe WCAG A/AA e verificação de largura nas telas percorridas; zero chamadas HTTP para serviços externos durante a jornada.
- [CI 38153083358](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38153083358), revisão `abe2fb4fbb8003d383c59f051fad53a42b47102b`: `npm run check` com formato, lint, tipos, 348 unitários, doze testes de scripts e build aprovado; 142 testes de RLS, 113 e2e/sete omissões e advisors locais de segurança/desempenho sem achados. Os quatro e2e da demonstração integram esse total.
- Verificação adicional no navegador: dois meses de cartões em imagem e urgência de 30% produziram R$ 936,00 (450 + 200 + 70 + 216), entrada/saldo de R$ 468,00 e entrega fictícia em 26/10/2026.

## Fonte e pacote conferidos

- [PR #2](https://github.com/Harmony-Digital/andre-calculos/pull/2) integrado pela proteção normal da main em `9a25f31e06a876e806c1dcf353c31c8b6ccd4cdd`; aplicativo idêntico à revisão aprovada no CI.
- Pacote local `/private/tmp/andre-calculos-demo.zip`: 158 arquivos, `package.json` na raiz, SHA-256 `85d678b463ef38fe5d3e3ddfd36fe4fdf2cebf49c82cc85b9b808d56ba7a8859`. Cada arquivo foi comparado com a main. Manifesto: `pacote-manifesto.json`.
- Pacote sem `.env*`, `.git`, áudio, transcrição, testes, `node_modules` ou `.next`. Fontes e script de assets necessários ao build incluídos.
- Painel Vercel conferido na conta cliente, equipe `Projeto Andre`/`projeto-andre1`/`team_4fdLDCsB0ROvP5ph50aFNvxm`; projeto `andre-calculos`/`prj_tdmzmC6utVU2fHPz0iVhroMD8NtI`. Ajustes salvos: Next.js, Node 22, raiz vazia e comandos padrão. Sem integração Git, variáveis de ambiente ou aquisição de plano/domínio.
- O seletor automatizado recusou o envio por falta de acesso da extensão a URLs de arquivo. A tentativa seguinte de leitura da aba recebeu a recusa de segurança: acesso a vercel.com negado pelo usuário. Nenhuma publicação ou acesso alternativo foi tentado após essa recusa.
- [Vercel Drop](https://vercel.com/docs/drop) documenta envio de código de framework em ZIP ao projeto sem Git; isso não substitui a integração contínua de M1.50. Upload sem Git não informa o SHA de commit ao endpoint de saúde; a procedência é a comparação do pacote acima.

O status e a publicação ficam exclusivamente no `plan.md`.

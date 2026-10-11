# Conferência do aceite eletrônico (M2.15)

Ensaios de 2026-10-11 no Supabase local exclusivo `andre-calculos`, com usuários,
pedidos, propostas e documentos inventados. Não há contratação, cobrança ou
mensagem real nestes ensaios.

## Registro contratual

O aceite vincula proposta/número, conteúdo preparado, usuário autenticado,
instante, primeiro IP HTTP válido e user agent limitado. Termos e informação de
privacidade ficam arquivados integralmente no contexto privado, com versões e
SHA-256; o recibo aponta para o hash do contexto. Configurações posteriores não
reescrevem o documento aceito.

Somente o proprietário com papel de cliente confirma o aceite. A action não
aceita ator, valor, IP ou user agent do formulário. RPC de escrita pertence ao
servidor; getters exigem sessão e propriedade ou papel de calculista. Admin,
outro cliente e visitante não consultam o conteúdo. As três tabelas privadas
não concedem leitura ou escrita direta aos papéis da aplicação.

## Estado e atomicidade

- Cliente comum passa a `awaiting_payment`.
- Cliente com contrato passa a `queued` somente com documento do processo
  confirmado e íntegro. Sem documento passa a `awaiting_documents`. O primeiro
  upload confirmado depois do aceite libera a fila atomicamente; o recibo
  original continua imutável. Sinal dispensado e valor total para pagamento
  no final ficam explícitos na condição registrada.
- Arquivo pendente, hash divergente ou entrega não atende o documento mínimo.
- Duas tentativas concorrentes recuperam um único recibo. Repetir a tentativa
  mantém data, conteúdo e metadados originais, mesmo após mudar termos ou status.
- Reusar o UUID para outra proposta é recusado. Recibo, intenção, projeção do
  aceite, estado, histórico, auditoria e avisos pertencem à mesma transação.
- Falha injetada no último aviso reverte todos os efeitos do aceite. Os avisos
  ficam `pending`, com zero tentativas. Não há despacho para provedor.
- A validade é reconferida imediatamente antes do recibo, depois dos locks de
  configuração e documento. Um ensaio observa o bloqueio PostgreSQL e libera
  o documento só após o vencimento; nenhum aceite é gravado.
- Campos ausentes/NULL, tipos divergentes, datas sem offset ou datas civis com
  horário e tabela de preço divergente não geram contexto contratual.

## Navegador

A entrada ocorre pela pasta do processo. Os textos exatos ficam disponíveis na
proposta; o checkbox começa desmarcado e o botão exige confirmação. Uma resposta
interrompida após o commit preserva a escolha; repetir recupera o recibo, sem
novo evento ou aviso. Recarga conserva o registro e a pasta continua oferecendo
o link da proposta. O calculista vê o registro sem formulário de aceite;
mensagens e documentos abrem a pasta no painel. Vencimento e divergência legal
também ficam visíveis para o calculista, para orientar a reconferência.

Proposta vencida ou versões legais divergentes bloqueiam nova contratação.
O upload também recupera uma confirmação com resposta perdida: o botão
“Confirmar envio” reusa o arquivo anterior, sem novo upload, evento ou aviso.
A proposta fictícia do checklist continua sem aceite. Leitura da proposta/PDF
permanece privada. Axe, teclado e ausência de rolagem horizontal são verificados
em 375 e 1440 px, inclusive com versões legais de duzentos caracteres.

## Capturas inspecionadas

- [Aceite no computador](aceite-computador.png) e [no celular](aceite-celular.png).
- [Recibo no computador](recibo-computador.png) e [no celular](recibo-celular.png).
- [Versões extensas no computador](legais-extensos-computador.png) e [no celular](legais-extensos-celular.png).

## Reproduzir

```sh
npm --prefix app run check
bash scripts/dev-env.sh npm run test:rls
bash scripts/dev-env.sh npm run test:e2e -- --workers=2
DOCKER_HOST='unix:///Users/fabioalmeida/.colima/andre-calculos/docker.sock' supabase db lint --local --level warning
```

O teste positivo cria uma proposta legada exclusiva, com snapshot público vazio,
e insere seu contexto sintético usando PostgreSQL local. Esse preparo não está
exposto por uma RPC de escrita, não promove simulações e não altera as guardas
0033/0034. O futuro produtor comercial deverá criar proposta, contexto e reserva
de agenda atomicamente com fontes reais confirmadas. A simulação do checklist
não é um caminho para criar contratos.

As migrations locais 0036–0040 mantêm RLS e funções privilegiadas com
`search_path` vazio. A conferência local inclui lint SQL, catálogo de permissões
e índices. Advisors da nuvem dependem da conexão dedicada e não são substituídos
por esses ensaios. Contagens e andamento ficam somente no `plan.md`.

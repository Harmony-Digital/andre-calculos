# Verificação local da fila do André

Ensaio de 2026-10-11 no Supabase local exclusivo do André. Usuários, processos, pedidos e pagamentos são inteiramente fictícios. Não houve cobrança nem publicação.

- `bash scripts/dev-env.sh npm run check`: formatação, lint, tipos, 267 unitários e build aprovados.
- `bash scripts/dev-env.sh npm run test:rls`: 55 aprovados; a fila usa as permissões existentes, sem ampliar grants.
- `bash scripts/dev-env.sh npm run test:e2e -- --workers=4`: 71 aprovados; cinco ensaios únicos omitidos só no celular. Dois cenários novos passaram em 375 e 1440 px, incluindo axe e largura da página.
- Migration local 0023; `supabase db lint --local` e `supabase db advisors --local --type all` sem achados.
- Read-back: dados profissionais/aprovações legais vazios, zero preços ativos/processos temporários, papel calculista confirmado e 23 migrations locais.

A fila exige calculista e apresenta seis estados operacionais. Rascunhos, triagens, aguardando sinal e pedidos terminais ficam fora. Cliente e administrador recebem acesso negado; links levam à pasta do processo. Desktop usa tabela e celular usa cartões, sem rolagem horizontal da página.

Ordenação por `internal_due_date ASC NULLS LAST, id ASC`. Ensaio recuperou todos os 116 pedidos com datas empatadas e doze sem prazo. Filtro de revisão recuperou 61 pedidos apesar de 55 pedidos de outro estado virem antes na ordenação geral. Cursor datado e cursor nulo não perderam/repetiram registros; troca de filtro reinicia a paginação e cursor/estado inválido retorna 404. A fila é viva: mudanças de estado/prazo entre páginas podem mudar o conjunto, e uma nova leitura deve começar pelos primeiros pedidos.

Soma em centavos conta somente sinais/saldos confirmados, uma vez por pagamento. Pendências, pagamentos de triagem e estornos não viram quitação. Ensaio distinguiu sinal pendente/parcial/confirmado e quitado; unitário confirma que contrato é uma condição comercial, sem significar quitação.

“Hoje” usa São Paulo e é capturado uma vez em cada renderização; a página é dinâmica. Datas internas são exibidas como datas civis. Unitários cobrem virada do dia em UTC/São Paulo, vencimento hoje/atrasado/ausente, sexta-feira com feriado de 12/10 e recesso. O segundo dia útil está incluído; o dia inicial não entra na contagem. Calendário permanece provisório e a tela pede conferência de feriados/suspensões locais do TRT. Não houve aprovação de calendário judicial real.

O ensaio inicial encontrou contraste insuficiente nos rótulos. As cores foram corrigidas, a acessibilidade passou e as capturas finais foram conferidas: [computador](fila-calculista-computador.png) e [celular](fila-calculista-celular.png).

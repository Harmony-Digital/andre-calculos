# Lembretes de prazo

A seleção usa a data civil de São Paulo e os seis estados da fila: `queued`, `in_analysis`, `awaiting_client`, `in_calculation`, `in_review` e `in_adjustment`. Pedido sem prazo, entregue ou fora desses estados não gera lembrete.

Em dia útil, o calendário determina os próximos um e dois dias úteis. Só prazos exatamente nessas datas recebem aviso antecipado. Um prazo anterior a hoje recebe aviso de atraso, inclusive no fim de semana ou recesso. O prazo armazenado nunca é deslocado; prazo igual a hoje não gera um dos três avisos. Uma execução perdida não é recuperada como antecipado em dia não útil.

A versão `br-processual-provisorio-v1` identifica o calendário local. Feriados/suspensões do TRT e os três casos de conferência precisam ser confirmados antes da ativação real. Nenhuma variável ou parâmetro HTTP registra essa aprovação.

## Janela e preferências

Configurações mantém os horários pontuais existentes de 09:00/17:00 e oferece campos independentes para a janela dos lembretes: inicialmente de 07:00 até antes de 21:00, em Brasília. O início pertence à janela e o fim fica excluído; início e fim devem estar no mesmo dia. A gravação usa a revisão/auditoria das configurações. Formulário antigo que omita ambos os novos campos preserva a janela atual.

O banco revalida a janela depois dos locks. Fora dela não é consumido recibo. O responsável precisa continuar sendo o calculista vinculado; canal habilitado sem contato configurado também não consome. Canais desligados consomem a ocorrência sem criar aviso, conforme as preferências: ligar depois não recupera ocorrências anteriores.

## Deduplicação e mudança de prazo

O recibo privado tem chave `(pedido, evento, prazo interno)`. A data na chave é o prazo interno, não o dia de execução. A outbox `notifications` usa `deadline:{order}:{evento}:{prazo}:email` ou `:whatsapp`. Assim há apenas um aviso de atraso por prazo, sem novo aviso diário. Payload contém código/data e identificadores internos; nunca CNJ, nomes de partes, documentos ou links privados.

Alterar ou remover o prazo cancela apenas avisos pendentes daquele pedido. Sair da fila também cancela pendentes. Avisos enviados/falhos e recibos permanecem no histórico. Voltar de prazo A para B e depois A, ou sair e retornar à fila, não reabre recibos já consumidos. O cancelamento, o recibo, a notificação e a auditoria são transacionais.

A seleção percorre páginas de cem por UUID; uma alteração de prazo não desloca o cursor. Cada enqueue trava o pedido e confere prazo/estado novamente. A ordem dos locks é pedido → configurações → vínculo → notificação. O futuro dispatcher deve seguir essa ordem, selecionar candidatos sem lock e revalidar prazo/estado, classificação temporal, janela e status antes de enviar. `cancelled` nunca deve ser despachado. Uma notificação de dois dias pode envelhecer mesmo sem mudar o prazo.

## Endpoint e ativação

`GET /api/cron/deadlines` exige `Authorization: Bearer <CRON_SECRET>`. Segredo ausente/curto responde 503; autorização inválida responde 401 antes de criar cliente administrativo. Query string é recusada. A resposta não fica em cache e falhas retornam mensagem genérica.

O endpoint permite apenas o ambiente local exclusivo: `ANDRE_LOCAL_TESTS=1`, Supabase em `http://127.0.0.1:54321` e ausência de `VERCEL_ENV`. Em nuvem, o calendário provisório bloqueia a execução com 503. O wrapper local deriva um segredo de teste em memória, sem arquivo/log. A RPC pública usa o relógio real do banco; relógio fictício é permitido somente ao proprietário do banco no helper privado dos ensaios, sem EXECUTE para `service_role`.

Depois da revisão do calendário e da implementação dos provedores/dispatcher, preparar a mudança de ativação com preflight da conta/equipe/projeto e `CRON_SECRET` cadastrado pelo Fábio. A Vercel envia esse segredo no header Bearer. [Documentação da Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

A configuração futura em `app/vercel.json` será `/api/cron/deadlines` com frequência horária (`0 * * * *`). Essa entrada permanece fora da configuração ativa; o agendamento real é criado no deploy de produção. [Configuração e ativação do cron](https://vercel.com/docs/cron-jobs/quickstart).

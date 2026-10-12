# Evidências de M3.01ad — origem explícita do legado fictício

Esta implementação usa dados fictícios e o PostgreSQL local deste projeto. A entrega e seus resultados finais ficam registrados somente em `plan.md`.

## Origem e identidade

O produtor recebe apenas IDs de observação e solicitação. Confere a cadeia durável T/N/R, conta sandbox da fixture, cliente, cobrança, intenção, pedido e fase; usa o bruto RECEIVED comprovado e seguro, sem deduzir origem por referência ou usar o líquido depois da taxa. Cria uma linha histórica e sua origem privada na mesma transação. Uma charge tem uma representação normal; a repetição recupera o recibo original e solicitação divergente conflita.

A origem preserva o snapshot mínimo da linha, receipt e observação históricos. A linha e os registros de origem/vínculo são imutáveis. DELETE administrativo de fixtures exige `session_user=postgres` e marker ativo; PostgREST conserva outra sessão, inclusive dentro de função SECURITY DEFINER. O ensaio prepara essa sessão com o administrador do banco local e exige o erro do trigger, distinguindo imutabilidade de falta de grant. A limpeza remove recibos/vínculos/origens/linhas antes de T/R/N e restaura o marker.

## Vínculo e composição

O caller fornece IDs da origem, aplicação Y e solicitação. A transação usa os locks comuns de AB/Y/T/AC, três fences e captura corrente. Depois de uma espera, recupera novamente o recibo e relê as fontes. Origem, linha e aplicação precisam corresponder; o vínculo não escolhe vencedor de conflito nem transforma UNKNOWN em crédito.

Vínculo, recibo, auditoria e reavaliação da fila são atômicos. A posição W entra uma vez e o valor antigo não revive depois de refund. Y aplicada antes do vínculo pode deixar a composição incerta; o vínculo passa a fila pelo helper comum quando aceitação, sinal/documento ou contrato permitem, sem outro aviso de RECEIVED. Vínculo com aplicação incerta seguido de uma nova Y também conserva essa ordem. Uma representação extra sem origem permanece desconhecida.

## Ensaios e fronteira

Os testes percorrem duas contas com ID do provedor igual, recuperação R/find, fase saldo e aplicação cruzada, origens/solicitações divergentes concorrentes, perda de resposta em outro processo, rollback e erro nativo após vínculo/fila/aviso efetivamente criados. Comparam históricos G/I/R/N/T/Y e posição W, autoria de sistema, run/claim/reserva e POST. Verificam imutabilidade antes/depois do vínculo, grants/RLS e recusa dos RPCs por anon/cliente/calculista.

AE continua responsável pela jornada integrada nas telas e pelas intercalações completas com terminal e reservas/claims posteriores. AA e V permanecem obrigatórias; esta parte não ativa provedor, produção, publicação ou mensagens reais.

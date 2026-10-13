# Claims e consulta de webhooks

A recepção é um gatilho para consultar a cobrança atual pelo protocolo T existente. O evento recebido não comprova dinheiro. O lote é ligado à conta e ao pagamento produzidos, com IDs, hashes, revisão, worker e epoch. A consulta permanece durável depois de perda de resposta. Reclaim conserva a query quando a fonte continua atual; outra consulta ou evento exige um run novo.

Os 26 testes de processamento cobrem replay, concorrência, lease, resposta perdida após commit, auditoria com falha, fonte nova durante consulta, identidade divergente nos eventos e conflitos, pagamento sem vínculo, outra conta, papéis, marker e evento mínimo/antigo. Nenhum teste desta parte aplica crédito. Os consumidores financeiros e a fila do André pertencem às partes c3b/c3c do plano.

A recepção serializa o ID do evento antes de reler seu pagamento original imutável e toma a barreira desse pagamento. Claim/consulta/finalização não tomam o mutex de evento. O ensaio de lock verifica pg_blocking_pids, inclusive para conflito que muda payment.id. Assim não existe a ordem inversa entre esses dois mutexes.

As falhas anteriores e a falha de projeção em103 estão preservadas. As migrations aplicadas101–103 permanecem intactas;104 corrige a união. As quatro aplicações tiveram advisors de segurança e desempenho sem achados. Read-back e controles anteriores foram comparados depois da limpeza do foco; namespaces novos vazios e sem grants diretos.

O check local passou formato/lint/tipos,1.490 unidades em74arquivos e43 testes de scripts. O build terminou com EPERM ao abrir a porta interna do Turbopack, a mesma limitação do ambiente já registrada. A prova remota deve ser da fonte nova. A regressão geral está em execução; consultar o plan.md para o estado atual.

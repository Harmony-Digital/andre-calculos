# Evidências de M3.01y — aplicação financeira local

Recorte autorizado: dados fictícios e banco local deste projeto. O caso de sistema recebe apenas IDs da observação T e da solicitação. Não chama Asaas nem despacha mensagens reais. O estado da entrega e as próximas tarefas ficam somente em `plan.md`.

## Aplicação e recuperação

A derivação usa o motor W e recupera identidade, fatos, provas, histórico e posição no servidor. A transação compara revisão da posição, revisão da cobrança e fingerprint canônico depois dos locks comuns ao domínio. O escritor é VOLATILE; o leitor STABLE mantém a fonte coerente. O vínculo bruto do contexto/binding também precisa coincidir com os snapshots imutáveis e a expectativa da cobrança.

Posição, recibo, auditoria com autor de sistema, linha do tempo, avisos e transição interna da fila confirmam juntos. A observação T já existe antes desse commit e permanece após qualquer falha. O recibo imutável é recuperado antes de rederivar; os mesmos IDs conservam a resposta original, inclusive em outro processo e após alterações posteriores de estado ou contato. Solicitação vinculada a outra observação é recusada.

`same` sem cobertura nova não altera revisão, avisos ou fila. Uma fonte antiga ou um `same` obsoleto não encobre consulta pendente, UNKNOWN ou conflito. `hold` conserva os valores observados e o último crédito conhecido; ausência de valores pertence à conciliação, sem inventar zero disponível. `replace` exige composição calculada e preserva os prefixos de devoluções/provas anteriores.

## Efeitos e fila

Movimentos comprovados são classificados mesmo quando a posição final exige conciliação. Recebimento, débito, restauração, encerramento e necessidade de conciliação têm avisos/rótulos próprios. DONE depois de uma disputa não repete o débito já registrado; cancelamento de PENDING não inventa restauração. Payloads contêm somente referências mínimas, sem body ou URL de fatura. Destino cliente/painel é fixado pelo template, nunca pelo papel/caminho do payload.

O dono atual precisa ter papel e contato válidos. A configuração e o responsável pelos avisos são conferidos sob locks; preferências por canal controlam o aviso ao calculista. Falha em contato obrigatório ou em qualquer efeito reverte a aplicação inteira.

A fila usa a projeção financeira comum: aceite e sinal suficiente conhecido, ou contrato, além de documento confirmado. Pagamento parcial e documento pendente não entram na fila. Estorno não retrocede trabalho ativo. Esta parte conserva run, claim e reserva: resolução e liberação pertencem a Z, origem explícita do legado a AA e integração dos demais consumidores a V.

## Ensaios

Os testes de banco verificam recebimento, incerteza, fontes antigas, conflitos duráveis, três fences separados, concorrência, recibo em outro processo, tentativa divergente, contatos/papel/preferências, RLS, valores mínimos e rollback após evento e depois da fila. Chamadas internas forjadas não podem apagar subtotal, restaurar prova desaparecida ou encobrir queda sem devolução comprovada. Ensaios de navegador cobrem filtros/rótulos financeiros, preferência nova e modelos de e-mail em 375/1440 px, com Axe e capturas.

Comandos, contagens finais, hashes de logs, fonte e resultados do CI são registrados em `plan.md` após verificação. Revisões independentes por leitura complementam os testes, sem substituí-los.

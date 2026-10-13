# Evidência da interface da fatura do saldo — M3.01av

Pedidos entregues/concluídos oferecem “Consultar fatura do saldo” nas áreas do advogado e do calculista, somente no modo fictício autorizado. A página compartilhada valida a fase e apresenta valor/vencimento/meio, recebimento e restante com títulos próprios. Estados pago, parcial, incerto, bloqueado e gratuito distinguem saldo e sinal. A atualização conserva a fase; abertura usa rota interna que reautoriza e reconfere o contexto atual, com retorno à área correta quando houve mudança.

20 percursos novos em375/1440 passaram na regressão final:63 aprovados/uma omissão antiga prevista para PDF grande no celular. Incluem os20 novos,14 da fatura do sinal,16 de acesso financeiro à entrega e login/pasta/PDF. Advogado/calculista foram exercitados nos estados ativo,incerto,pago,parcial,gratuito e entrega retirada;Pix/boleto/cartão/escolha,perda-reenvio,crédito alterado,abertura atual,isolamento de papéis/pares/fase e rollback de auditoria também foram verificados. Redirects externos foram inspecionados com redirects desativados,sem navegação ao Asaas. Nenhuma URL externa no HTML e nenhum campo de cartão nesta página.

38 capturas passaram emAxeAA e larguraCSS;12 amostras atuais foram inspecionadas visualmente,sem cortes ou sobreposições. As fontes e as cores existentes foram preservadas. Capturas copiadas sem alteração e hashes no manifesto;QA aponta os arquivos efetivamente vistos.

51 regressões de banco emdois arquivos passaram após as jornadas;read-back98/25/56RLS/quatro perfis,controles/grants/pagamento original idênticos ao final deAU,sem queries/auditorias/objetos temporários residuais. Dois advisors sem achados.12 unitários da rota (5 novos),1441 gerais/72arquivos e43scripts/formato/lint/tipos aprovados. Build local encontrou EPERM de processo/portaTurbopack;check-build remoto da fonte exata ainda necessário. Sem migration nova nesta interface.

AS/B e operação externa permanecem condicionados à verificação geral e às próprias tarefas. Esta evidência demonstra preparo local fictício;nenhuma nova publicação,driver,webhook ou cobrança real.

# Campos obrigatórios no Auth público

O hook recebe o mesmo transporte produzido por parseSignup/signupMetadata. Migrations locais 0049/0050 conferem tipos JSON, nome e razão/escritório, CPF/CNPJ com verificadores, celular E.164 e coerência/limites dos opcionais OAB/UF/cidade antes de qualquer insert. Bootstrap administrativo privado e aceites da 0048 permanecem separados. Papel e contrato nunca vêm de metadados públicos; mudança posterior de metadata não altera perfil/cliente/consentimentos.

A normalização de celular agora recusa país diferente de +55, sinal no meio e sinais duplicados. CNPJ numérico/alfanumérico mantém ASCII−48 e zeros iniciais; não remove Unicode ou pontuação arbitrária.

O primeiro ensaio real encontrou uma suposição incorreta da contagem Unicode: Zod 4.6.5 mede pontos de código, e não UTF-16. 0049 já aplicada localmente foi preservada e 0050 corrige o limite por char_length. Novos vetores atravessam mínimos/máximos com caracteres fora do BMP e todos os 25 espaços de String.trim(). Revisão independente por leitura não encontrou outro defeito material; um negativo Unicode adicional tem exatamente 14 caracteres para isolar o alfabeto ASCII.

Ensaio específico anterior: 121 testes aprovados em 23,62 s. A suíte geral da fonte atual está em execução; 98 testes de campos incluem negativos de chamada real ao Auth, comparação de contagens de seis tabelas e ausência de usuário pelo e-mail, positivos do parser chegando sem perda, dois consentimentos e ausência de elevação por metadata. Testes jurídicos anteriores agora fornecem os demais campos válidos, preservando a relevância do gate/rollback.

npm run check aprovou formato/lint/tipos, 362 unitários e doze testes de scripts; build local recusado pelo ambiente ao abrir a porta interna do Turbopack. Build/check da nova fonte precisam do CI remoto. Advisors locais de segurança e desempenho pós-0050 sem achados. Nenhuma migration/configuração Auth foi aplicada à nuvem, nenhuma credencial ou dado real foi salvo.

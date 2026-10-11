# Regras de validação do cadastro

O documento é armazenado como texto, sem perder zeros iniciais. Aceitar somente formato sem máscara ou máscara conhecida; caracteres inesperados não são removidos para produzir um resultado válido. CPF usa dois dígitos de módulo 11 e rejeita sequências repetidas. CNPJ aceita formato numérico e, desde julho de 2026, alfanumérico: 12 caracteres ASCII de 0–9/A–Z, mais dois dígitos numéricos. Cada letra vale ASCII menos 48 (A = 17), conforme o manual da Receita; não usar base 36.

Referências primárias: [CNPJ alfanumérico — Receita Federal](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico), [manual do dígito verificador](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf) e [implementação pública do CPF no Abex](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/formularios/impostos/abex.html/view).

Celular brasileiro é convertido para +55, DDD válido e nove dígitos começando por 9. [Plano de numeração — Anatel](https://www.gov.br/anatel/pt-br/regulado/numeracao/plano-de-numeracao-brasileiro). OAB é texto com UF separada; sufixos de letra são aceitos. A validação sintática não confirma identidade, regularidade do documento ou inscrição ativa no [CNA](https://cna.oab.org.br/).

O servidor recebe e valida o formulário, confere as versões legais exibidas e chama Auth com confirmação de e-mail obrigatória. O trigger cria o cliente com papel client, preserva aceites em consents e rejeita versões que mudaram entre exibição e gravação. Metadata não pode criar papel administrativo nem modificar os aceites já registrados.

A recuperação e o link de acesso usam callback PKCE no servidor, exigindo o navegador que pediu o e-mail. Tokens de sessão ficam em cookies HttpOnly; URLs de confirmação e senhas nunca são registradas pelo app. Após troca de senha, registrar auditoria e executar logout global. Antes de cada acesso protegido, consultar getUser e o papel em profiles. [Fluxo PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [sessão e revogação no SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

O pedido de exclusão é auditado e idempotente. Não remove Auth, arquivos ou registros de negócio: a execução depende de análise da retenção legal. Testes usam contas e documentos sintéticos em localhost; nenhum cadastro real é usado como fixture.

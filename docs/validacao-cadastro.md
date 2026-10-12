# Regras de validação do cadastro

O documento é armazenado como texto, sem perder zeros iniciais. Aceitar somente formato sem máscara ou máscara conhecida; caracteres inesperados não são removidos para produzir um resultado válido. CPF usa dois dígitos de módulo 11 e rejeita sequências repetidas. CNPJ aceita formato numérico e, desde julho de 2026, alfanumérico: 12 caracteres ASCII de 0–9/A–Z, mais dois dígitos numéricos. Cada letra vale ASCII menos 48 (A = 17), conforme o manual da Receita; não usar base 36.

Referências primárias: [CNPJ alfanumérico — Receita Federal](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico), [manual do dígito verificador](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf) e [implementação pública do CPF no Abex](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/formularios/impostos/abex.html/view).

Celular brasileiro é convertido para +55, DDD válido e nove dígitos começando por 9. [Plano de numeração — Anatel](https://www.gov.br/anatel/pt-br/regulado/numeracao/plano-de-numeracao-brasileiro). OAB é texto com UF separada; sufixos de letra são aceitos. A validação sintática não confirma identidade, regularidade do documento ou inscrição ativa no [CNA](https://cna.oab.org.br/).

Quando o celular contém `+`, o sinal deve aparecer uma única vez, no início, seguido por `55`. País diferente e sinal no meio não são convertidos em celular brasileiro. A lista de 67 DDDs corresponde à [tabela de serviço móvel da Anatel](https://www.gov.br/anatel/pt-br/regulado/numeracao/tabela-servico-movel-celular).

O formulário produz metadados canônicos por `signupMetadata`. As migrations 0049/0050 validam esse transporte antes de inserir qualquer dado de cadastro público:

| Campo | Contrato do transporte |
|---|---|
| `full_name`, `legal_name` | Strings obrigatórias, aparadas, entre 3 e 200 pontos de código Unicode, como o parser Zod 4.6.5. |
| `phone` | String E.164: `+55`, DDD permitido e nove dígitos começando por `9`. |
| `kind`, `document` | Tipo exatamente `person`/`company`; documento textual, sem máscara, com verificadores válidos. CNPJ usa apenas ASCII maiúsculo e dígitos. |
| `oab_number`, `oab_state` | Opcionais; se fornecidos, devem ser strings. Ambos vazios ou ambos preenchidos. Número aparado com até 30 caracteres `[0-9A-Za-z/.-]`; UF brasileira em maiúsculas. |
| `city` | Opcional; se fornecido, string aparada com até 120 pontos de código Unicode. |

Ausência dos opcionais é aceita; JSON `null`, números, booleanos, arrays e objetos não são convertidos em texto. Campos obrigatórios não têm fallback público. O banco rejeita máscaras, letras minúsculas no CNPJ e texto com espaços nas bordas: a normalização pertence ao parser. Não corrige entrada inválida por truncamento. Caracteres Unicode fora do BMP contam um ponto de código; o trim das bordas acompanha `String.trim()` inclusive tabulações e NBSP. OAB vazia é persistida como nulo; cidade ausente fica nula e cidade enviada vazia permanece vazia.

O servidor recebe e valida o formulário, confere as versões legais exibidas e chama Auth com confirmação de e-mail obrigatória. O hook Auth exige `accepted_legal` como booleano JSON verdadeiro, configuração presente e duas versões textuais não vazias correspondentes à configuração trancada. Chamada direta ao Auth também passa por esse bloqueio. Perfil, cliente, dois consentimentos, auditoria e aviso são gravados na mesma transação; falha posterior não deixa conta parcial. Metadata não pode criar papel administrativo, condição de contrato ou modificar os aceites já registrados. Conteúdo jurídico e sua vigência continuam sujeitos à revisão de M2.03.

O bootstrap administrativo de fixtures usa `private.user_provisioning_grants`: UUID exato, uso único, validade curta conferida após o lock, RLS e nenhum acesso para os papéis da aplicação, inclusive `service_role`. Não há RPC pública de concessão nem exceção por e-mail, hostname ou variável de ambiente no hook. O helper de teste escreve a concessão somente pelo PostgreSQL administrativo do container local confirmado e constrói o cliente Auth a partir desse mesmo destino local; não aceita um cliente opaco de outro projeto.

O helper impõe `accepted_legal=false`, confirma o UUID retornado e usa o sucesso como prova do consumo atômico da concessão. Em falha, limpa a concessão residual. Provisionamento tem auditoria própria; não inventa consentimentos nem enfileira aviso de cadastro público. Papéis privilegiados de fixtures são atribuídos pelo SQL administrativo local depois da criação. As migrations 0047 e 0048 preservam a sequência já aplicada no ensaio; a segunda confere a expiração depois da espera por lock.

A recuperação e o link de acesso usam callback PKCE no servidor, exigindo o navegador que pediu o e-mail. Tokens de sessão ficam em cookies HttpOnly; URLs de confirmação e senhas nunca são registradas pelo app. Após troca de senha, registrar auditoria e executar logout global. Antes de cada acesso protegido, consultar getUser e o papel em profiles. [Fluxo PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [sessão e revogação no SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

O pedido de exclusão é auditado e idempotente. Não remove Auth, arquivos ou registros de negócio: a execução depende de análise da retenção legal. Testes usam contas e documentos sintéticos em localhost; nenhum cadastro real é usado como fixture.

A primeira aplicação local de 0049 contou UTF-16 por uma suposição de paridade com String.length. O teste que usa o parser instalado comprovou que Zod 4.6.5 mede pontos de código. A migration 0050 corrige o limite por char_length, preservando a migration já aplicada. Vetores nos mínimos/máximos incluem caracteres fora do BMP.

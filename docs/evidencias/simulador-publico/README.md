# Simulador público — preparo com dados fictícios

O simulador reutiliza o motor de preço em centavos. calculatePrice recebe somente parâmetros de preço; calculateQuote conserva classificação e prazo na área autenticada. A projeção pública deixa calendário, dias úteis, Pix, contatos, identificadores e textos de contratação fora do resultado.

A rota /simular consulta uma única tabela ativa real e exige identificação profissional preenchida. Sem configuração, apresenta indisponibilidade. A constraint do banco impede ativar uma tabela exemplo. /demonstracao/simulador usa somente a tabela demo-2026-v1 e a identificação fictícia já autorizada para apresentação.

O formulário recebe serviço, quantidades de verbas, meses, reclamantes, formato/quantidade dos cartões e urgência. Não recebe processo, documento ou contato, não emite proposta e não grava as respostas. Mostra serviços/adicionais discriminados, total, versão e premissas; remete ao cadastro/checklist para confirmar a proposta e a disponibilidade. Campos, textos e tabela comerciais ainda precisam da aprovação do André.

Cinco testes reais da função SQL0091 provaram projeção mínima com parâmetros extras privados, papéis anônimo/autenticado, tabela ausente/inativa/inválida, bloqueio de SELECT/escrita pelo anônimo na tabela privada e grants mínimos. As fixtures SQL usam transação com rollback. A migration foi aplicada somente no Supabase local; os dois advisors não apontaram problemas.

Dezoito testes novos e as 27 regressões de preço passaram; a suíte unitária completa passou com 1.321 testes em 65 arquivos. Oito casos próprios em 375/1440 px passaram com Axe: demonstração, validação/foco, indisponibilidade e tabela/identificação sintéticas. Verificaram equivalência em centavos, geometria e legibilidade, ausência de requisição do navegador ao banco/POST/cookie de sessão e contagens inalteradas de propostas/pedidos/pagamentos. Oito capturas finais foram inspecionadas visualmente.

A simulação da tabela ativa preserva seu histórico imutável e restaura o estado ativo/identificação. As versões criadas pelo ensaio ficam inativas no banco local, conforme a mesma regra das fixtures de configurações. Nenhum preço ou aprovação comercial real foi cadastrado.

Trinta e duas regressões de página inicial/demonstração/orçamento passaram. A suíte geral inicial terminou com 198 aprovados, sete omissões e uma falha: o formulário da preferência financeira ainda mostrava “Salvando…” ao atingir o limite original de cinco segundos. Instrumentação temporária conservou a falha original em caso de retorno tardio; os dois ensaios isolados passaram no primeiro limite, com feedback em 1.334/1.279 ms. A instrumentação foi removida e o teste voltou a ser byte a byte idêntico à fonte anterior. A execução geral inicial não é registrada como aprovada.

O check local passou em formato/lint/tipos, 1.321 unitários/65 arquivos e 43 testes de scripts, mas o build terminou com EPERM do Turbopack ao vincular porta. A fonte exata ainda exige check/build e suíte geral aprovados no CI. O read-back final confirma 91 migrations, 25 tabelas públicas e 55 privadas, todas com RLS; metadados/grants anteriores, donos e controles financeiros são idênticos ao baseline90. Tabela ativa ausente, identificação restaurada e os dois advisors finais sem achados. Logs selecionados e hashes estão em verificacao-local.json e hashes.json.

M3.14 comercial conserva suas condições próprias. A demonstração hospedada continua na main9a25, sem nova publicação.

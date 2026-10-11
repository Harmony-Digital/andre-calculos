# PRD — Portal de Cálculos Judiciais (projeto do André)

> Nome provisório. A marca da nova empresa de perícia sai do formulário de marca (decisão D3 no `plan.md`).

- **Versão:** 0.1 · 2026-10-10 · rascunho para validação do Fábio e do André
- **Dono do produto:** André (contador com CRC, cálculos judiciais)
- **Construção:** Harmony Digital Hub (Fábio), com agentes de IA
- **Infraestrutura:** Vercel e Supabase em contas do cliente; código na organização Harmony-Digital do GitHub (§11.0)
- **Fontes:** transcrição privada da reunião (2026-10-10), em `docs/transcricao-reuniao-2026-10-10.md`, preservada somente na pasta local; [pesquisa de concorrentes](<docs/pesquisa/reports/Concorrentes cálculos judiciais advogados.md>) e as notas em `docs/pesquisa/research_notes/`

Este PRD diz **o que** construir e **com quais ferramentas**. Ele não registra progresso: o estado vivo do projeto está no `plan.md`, na seção "Onde estamos".

---

## 1. Resumo

Portal onde advogados contratam cálculos judiciais (trabalhistas no início) feitos e assinados por um contador com CRC.

1. O advogado se cadastra de graça, responde um checklist e recebe o orçamento na hora.
2. Paga 50% de entrada.
3. Acompanha o pedido numa **pasta do processo**: documentos, mensagens, linha do tempo e decisões técnicas registradas.
4. Recebe o cálculo em PDF, o arquivo do PJe-Calc (.PJC) e o parecer técnico assinado.

Na segunda fase, o sistema lê o processo, extrai parâmetros e cartões de ponto e aplica as regras de juros e correção. O André só valida e assina.

**Modelo de negócio:** serviço com sistema, sem mensalidade para o advogado.

**Diferencial**, segundo a pesquisa de concorrentes: nenhum concorrente junta estes quatro itens:
- decisão técnica assinada e documentada, com a página de origem;
- prazo processual controlado pelo sistema;
- preço instantâneo e público;
- CRC visível.

A IA da fase 2 aumenta a capacidade e a margem do André, mas não é diferencial de mercado: Calcule AI, Cálculo Jurídico e Debit já vendem IA para cálculo.

## 2. Problema e oportunidade

### 2.1 Para o advogado

- **Prazos curtos, em dias úteis** (CLT art. 775):
  - 8 dias para impugnar a conta de liquidação (art. 879 §2º);
  - 5 dias para embargos à execução (art. 884);
  - 8 dias para agravo de petição (art. 897).
- **Atendimento informal no mercado:** a maioria atende por WhatsApp, orça manualmente, cobra 100% adiantado, raramente mostra CRC e não controla o prazo processual.
- **Juros e correção pesam muito:** escolher a regra errada muda o valor drasticamente. No exemplo do André, de R$ 5 mil para R$ 50 mil. Existem três regimes no tempo (IPCA-E com juros; Selic; IPCA com taxa legal pela Lei 14.905/2024), e cada juiz interpreta de um jeito.
- **Perfil:** 72% dos advogados são autônomos (OAB, 2024).

### 2.2 Para o André

- **Capacidade:** cerca de 4 cálculos bem feitos por dia.
- **Onde o tempo vai:**
  - ler PDFs de 300 a 700 páginas (já pegou um de 88 mil);
  - achar as páginas-chave;
  - digitar cartões de ponto manuscritos;
  - reler o processo quando ele volta maior.
- **Comunicação:** fica espalhada no WhatsApp, sem registro do que foi combinado com o advogado. Isso é um problema quando o juiz manda refazer.

### 2.3 Mercado

| Indicador | Valor |
|---|---|
| Casos novos nas Varas do Trabalho (2024) | 2,12 milhões |
| Fases de cumprimento de sentença (2024) | 2,01 milhões |
| Execuções pendentes (2024) | 3,09 milhões |
| Advogados regulares no país | 1,51 milhão |
| Advogados em SP | 396,6 mil |
| Advogados em MG | 151,8 mil |
| Advogados no DF | 54,6 mil |

Detalhes e fontes estão no relatório de concorrentes.

## 3. Objetivos e métricas

| Objetivo | Métrica | Meta inicial (validar com o André) |
|---|---|---|
| Validar a demanda (M2–M3) | cadastros, orçamentos e pedidos pagos por semana | definir após 30 dias no ar |
| Converter | orçamento que vira pedido pago | medir; meta definida no M3 |
| Cumprir o prazo | entregas no prazo prometido | ≥ 95% |
| Ganhar confiança | nota pós-entrega e reclamações públicas | nota ≥ 4,7 e zero reclamação |
| Aumentar a capacidade do André (M4–M5) | cálculos entregues por dia com a mesma qualidade | de cerca de 4 para cerca de 8 |
| Acurácia da IA (M4–M5) | campos corretos contra os casos antigos | meta por campo definida no M4; publicar só depois de medir |

## 4. Papéis

| Papel | Quem | O que pode fazer |
|---|---|---|
| Visitante | qualquer pessoa | ver o site e, no M3, simular orçamento sem cadastro |
| Cliente | advogado autônomo, advogado de escritório ou departamento jurídico de empresa | cadastrar-se, pedir orçamento, enviar documentos, pagar, conversar, baixar entregas e avaliar |
| Calculista | o André (no futuro, outros contadores) | gerenciar fila, pedidos, pasta, decisões técnicas, entregas, preços e textos padrão |
| Administração | Fábio (Harmony) | configurar e dar suporte; **sem acesso a documentos de processo** salvo autorização registrada (D13) |

Contas de escritório com vários usuários ficam para depois (M6).

## 5. Escopo por fase

| Marco | Nome | Inclui | Fica de fora nesta fase |
|---|---|---|---|
| M1 | Fundação técnica | repositório, CI, app base, banco, autenticação, arquivos, deploy, backup | — |
| M2 | Portal comercial no ar (MVP), **até ~2026-10-20** | site, cadastro, checklist e orçamento, aceite, sinal manual, upload, pasta do processo, prazos, fila, entrega, notificações (e-mail para todos, WhatsApp para o André), painel do André | pagamento automático, validação de assinatura, GA4 |
| M3 | Validação comercial | Asaas, contrato em PDF, garantia, validação de assinatura ICP-Brasil, atualizações e nova versão do PDF, GA4, simulador público, indicadores, DataJud, LGPD completo, pesquisa com advogados | IA |
| M4 | Operacional 1: leitura do processo com IA | acervo de casos, ingestão, páginas duplicadas, triagem e índice de páginas, extração de parâmetros com página de origem, medição de acurácia | cartões de ponto |
| M5 | Operacional 2: cartões de ponto, regras e parecer | cartões para CSV do PJe-Calc, motor de regras de juros e correção, rascunho de parecer | geração direta de .PJC |
| M6 | Mercado (a planejar) | convênios OAB, cível e previdenciário, escritórios, multi-calculista | — |

**Fora do escopo por enquanto:**
- assinatura mensal para o advogado;
- marketplace aberto de calculistas;
- app nativo (o site é responsivo);
- cálculo entregue sem revisão do André;
- geração direta do arquivo .PJC (investigar no M6).

## 6. Jornadas principais

### 6.1 Advogado: primeiro pedido

1. Chega pelo site (OAB, indicação ou busca). Vê o que está incluído, prazos, garantia, preço "a partir de" e o nome e CRC do responsável técnico.
2. Cria a conta: nome, e-mail, celular, OAB/UF, CPF ou CNPJ, escritório ou empresa, e aceite dos termos e da privacidade.
3. Em "Novo pedido", escolhe o caminho:
   - **Checklist:** responde as perguntas;
   - **Só o PDF:** envia o processo e paga a triagem (D5).
4. Informa o número do processo, o tipo de cálculo, de que lado está, a data da intimação, o tipo de ato (para o prazo) e se é urgente.
5. Recebe o orçamento na hora:
   - valor discriminado (base e adicionais);
   - prazo de entrega;
   - condições: 50% de entrada e 50% na entrega;
   - proposta em PDF com o CRC.
6. Aceita a proposta e recebe as instruções do sinal. No MVP é Pix manual, confirmado pelo André; no M3, link do Asaas confirmado automaticamente.
7. Envia o PDF do processo e outros documentos (cartões, fichas financeiras, instruções de estratégia). O upload é grande e retomável.
8. Acompanha tudo na pasta: status, mensagens e decisões técnicas.
9. Recebe a entrega: PDF do cálculo, .PJC e parecer assinado, mais petição ou planilha quando houver. Paga o saldo (D6) e baixa os arquivos.
10. Avalia o serviço. Meses depois, pede a atualização no mesmo processo.

### 6.2 André

1. **Recebe alertas:** novo cadastro, novo orçamento e pedido pago. O alerta de pedido pago chega por WhatsApp e e-mail: "Processo X, entrega dia Y".
2. **Trabalha pela fila:** ordenada pelo prazo interno, com a complexidade de cada pedido.
3. **Abre a pasta do processo:**
   - lê o PDF;
   - preenche o índice de páginas (sentença p. X, acórdão p. Y…);
   - registra cada decisão técnica com a origem e a página;
   - conversa com o advogado ali mesmo.
4. **Entrega:** calcula no PJe-Calc (fora do sistema), sobe o PDF, o .PJC e o parecer assinado, e marca o pedido como entregue.
5. **Quando o processo volta:** sobe a nova versão do PDF. O sistema mostra o que já foi lido e reaproveita o .PJC guardado.

## 7. Requisitos funcionais

Prioridades:
- **P0:** MVP (M2);
- **P1:** validação (M3);
- **P2:** depois.

Requisitos com marco próprio (M4, M5) indicam a fase operacional.

### 7.1 Site público

- **RF-01 (P0)** Página inicial com:
  - proposta de valor e como funciona;
  - o que está incluído (PDF, .PJC e parecer assinado);
  - prazos, garantia e preço "a partir de";
  - **nome, CRC e categoria do responsável técnico em destaque**;
  - contato.

  Os textos seguem a NBC PG 01: técnicos, moderados e sem "o mais barato", "100% de êxito" ou comparação depreciativa.
- **RF-02 (P0)** Termos de uso e política de privacidade, versionados. A política informa o tratamento de dados de processos e, a partir do M4, a transferência internacional para o provedor de IA.
- **RF-03 (P1)** Simulador público de orçamento, com checklist curto e sem cadastro.
- **RF-04 (P1)** Google Analytics 4 com banner de consentimento e Google Search Console, mostrando de que estado e cidade vêm os acessos. O André pediu isso na reunião.
- **RF-05 (P2)** Conteúdo técnico (Lei 14.905/2024, ADC 58, PJe-Calc) para busca orgânica e palestras na OAB.

### 7.2 Conta

- **RF-10 (P0)** Cadastro com e-mail e senha, mais link de acesso por e-mail.
  - **Campos:** nome, e-mail, celular (WhatsApp), OAB e UF (opcional para departamento jurídico), CPF ou CNPJ, escritório ou empresa.
  - **Aceite:** versão e data dos termos e da política.
- **RF-11 (P0)** Alerta ao André a cada cadastro, mesmo que o advogado não faça mais nada.
- **RF-12 (P0)** Perfil, troca de senha e pedido de exclusão de conta. A exclusão respeita a retenção legal.
- **RF-13 (P2)** Escritório com vários usuários e papéis.

### 7.3 Checklist e orçamento

- **RF-20 (P0)** Checklist trabalhista em etapas, com schema versionado. As respostas ficam guardadas com a versão usada.
  - **Identificação:** número do processo (padrão CNJ), TRT, vara, lado (reclamante ou reclamada) e número de reclamantes.
  - **Tipo de cálculo:** inicial, liquidação/execução, impugnação do cálculo da outra parte (com o cálculo anexo) ou atualização (com o .PJC anterior, se houver).
  - **Decisões:**
    - existe sentença?
    - houve acórdão que alterou a sentença?
    - há decisão interlocutória relevante?
    - a decisão fixou expressamente o índice de correção e os juros? Qual: ADC 58 (IPCA-E e Selic), Lei 14.905/2024 (IPCA e taxa legal), outro ou não fixou?
    - a estratégia do advogado difere da decisão? (texto livre)
  - **Datas:** admissão, demissão, ajuizamento e data-base da liquidação ou atualização.
  - **Verbas:** horas extras, intervalo, adicional noturno, insalubridade, periculosidade, verbas rescisórias, FGTS e 40%, multas dos arts. 467 e 477, diferenças salariais, danos morais, reflexos e outras.
  - **Jornada:**
    - cartões digitais;
    - cartões manuscritos ou em imagem que precisam ser digitados, com estimativa de meses ou páginas;
    - jornada fixada pelo juiz.
  - **Documentos disponíveis:** fichas financeiras, holerites, cartões e CTPS.
  - **Descontos:** INSS e IR.
  - **Prazo:** data da intimação, tipo de ato e se é urgente.
  - **Instruções do advogado:** texto e anexos.
- **RF-21 (P0)** Motor de preço determinístico.
  - **Base:** preço por tipo de cálculo.
  - **Adicionais:** por verba, por período contratual, por cartão de ponto a digitar (por mês ou por página), por reclamante extra, e percentual de urgência.
  - **Tabela:** editável pelo André e versionada. O orçamento guarda a versão usada.
- **RF-22 (P0)** Prazo de entrega proposto conforme a complexidade, a fila e a urgência.
  - Nunca passa do prazo interno (RF-51).
  - Se não couber, o sistema avisa e oferece urgência ou recusa o pedido.
- **RF-23 (P0)** Orçamento discriminado, conforme a NBC PG 01 (itens 8 e 9):
  - cada serviço com seu valor;
  - total, validade e prazo;
  - condições (50% e 50%);
  - nome e CRC;
  - PDF da proposta.
- **RF-24 (P0)** Caminho "Só o PDF":
  - taxa de triagem configurável (D5);
  - depois da triagem, o André preenche o checklist e o sistema gera o orçamento;
  - a triagem entrega o índice de páginas ao advogado.
- **RF-25 (P0)** Alerta ao André a cada orçamento gerado, mesmo que não seja aceito.
- **RF-26 (P1)** Ajuste manual do orçamento pelo André, com motivo registrado.

### 7.4 Pedido, upload e pagamento

- **RF-30 (P0)** Aceite eletrônico da proposta, registrando usuário, data e hora, IP e versão da proposta. O aceite vale como contrato junto com os termos de serviço. O contrato em PDF próprio vem no M3.
- **RF-31 (P0)** Sinal de 50%:
  - **MVP:** instruções de Pix e confirmação manual pelo André, com um clique;
  - **M3 (P1):** Asaas, com link de Pix, boleto ou cartão, confirmação por webhook e um botão para o André ligar ou desligar.
- **RF-32 (P0)** "Cliente com contrato" (paga no final): o André marca no cadastro, e o pedido entra na fila sem sinal.
- **RF-33 (P0)** Upload retomável:
  - vários arquivos;
  - até 500 MB por arquivo no MVP (configurável);
  - tipos PDF, XLSX, CSV, DOCX, imagens e .PJC;
  - barra de progresso e hash de integridade.
- **RF-34 (P0)** O pedido entra na fila quando tem:
  - proposta aceita;
  - sinal confirmado ou cliente com contrato;
  - documento mínimo enviado.
- **RF-35 (P1)** Saldo de 50% cobrado na entrega. Liberar o download antes ou depois do saldo é a decisão D6.
- **RF-36 (P1)** Política publicada de garantia e reembolso do sinal quando o prazo estoura por culpa do prestador (D5). Isso responde ao único caso público de calote no setor, encontrado na pesquisa.

### 7.5 Pasta do processo ("raiz")

- **RF-40 (P0)** Uma pasta por processo (número CNJ), com todos os pedidos daquele processo: inicial, liquidação, impugnação e atualizações.
- **RF-41 (P0)** Documentos organizados em pastas fixas:
  - Processo (PDFs e versões);
  - Documentos do cliente;
  - Entregas;
  - Triagem.

  Há visualizador de PDF no navegador, e o download usa URL assinada de curta duração.
- **RF-42 (P0)** Linha do tempo com eventos automáticos (status, uploads, pagamentos, mensagens, decisões) e notas.
- **RF-43 (P0)** Mensagens entre o advogado e o André dentro da pasta, com anexos e aviso por e-mail. Documento nunca circula por WhatsApp.
- **RF-44 (P0)** Registro de decisões técnicas, em campos estruturados:
  - **parâmetro:** índice de correção, juros, marco inicial, período, verba, dedução…;
  - **valor escolhido;**
  - **origem:** sentença, acórdão, decisão, advogado ou André;
  - **página de origem;**
  - **justificativa curta;**
  - **quem registrou e quando;**
  - **confirmação do advogado.**

  O registro é exportável em PDF como anexo do parecer.
- **RF-45 (P0)** Índice de páginas do processo, que substitui o rascunho no Word do André: tipo de peça e as páginas onde ela está. É editável e reaproveitado nas atualizações.
- **RF-46 (P1)** Nova versão do PDF quando o processo volta: a anterior fica guardada, as páginas já lidas ficam marcadas e só o que é novo aparece em destaque.
- **RF-47 (P1)** Botão "de acordo" do advogado nas decisões técnicas, que fica registrado como prova.

### 7.6 Prazos e fila

- **RF-50 (P0)** Calculadora de prazo processual em dias úteis (CLT art. 775).
  - **Calendário:** feriados nacionais e recesso de 20/12 a 20/01 (art. 775-A). Feriados locais e suspensões dos tribunais entram por ajuste manual, com motivo.
  - **Tipos de ato:**
    - impugnação: 8 dias;
    - embargos: 5 dias;
    - agravo de petição: 8 dias;
    - outro: dias informados pelo advogado.
- **RF-51 (P0)** Prazo interno de entrega = vencimento menos a folga. A folga padrão é de 2 dias úteis, configurável (D10). O prazo prometido ao cliente nunca passa do prazo interno.
- **RF-52 (P0)** Fila do André ordenada pelo prazo interno. Mostra status, complexidade, valor e situação do pagamento, com destaque para o que está vencendo ou atrasado.
- **RF-53 (P0)** Alertas ao André:
  - pedido entrou na fila ("Processo X, entrega dia Y");
  - dois dias antes do prazo interno;
  - um dia antes;
  - atraso.
- **RF-54 (P0)** Classificador de complexidade por regras:
  - **simples:** por exemplo, verbas rescisórias;
  - **média;**
  - **alta:** horas extras com cartão manual, muitos reclamantes, PDF acima de N páginas.

  A complexidade ajusta o preço e o prazo.
- **RF-55 (P2)** Capacidade diária: limite de pedidos por dia e recusa de urgência sem agenda.

### 7.7 Entrega

- **RF-60 (P0)** O André sobe as entregas: PDF do cálculo, .PJC, parecer técnico assinado e, quando houver, petição ou planilha.
  - **Checklist de pré-juntada:**
    - o .pjc está liquidado e tem CPF ou CNPJ cadastrado (sem isso o PJe recusa);
    - versão do PJe-Calc usada;
    - mês da tabela de índices.
- **RF-61 (P0)** Aviso ao advogado e download das entregas, com registro na auditoria.
- **RF-62 (P1)** Verificação da assinatura ICP-Brasil do parecer (PAdES): a assinatura existe, é válida e o CPF do signatário é o do André.
- **RF-63 (P1)** Pedido de revisão dentro da garantia, ligado ao pedido original.
- **RF-64 (P1)** Avaliação depois da entrega (nota de 1 a 5 e comentário) e convite para avaliar no Google.

### 7.8 Notificações

| Evento | Advogado | André |
|---|---|---|
| Cadastro | e-mail de boas-vindas | e-mail (WhatsApp opcional) |
| Orçamento gerado | e-mail com a proposta | e-mail |
| Proposta aceita | e-mail com instruções de pagamento | e-mail |
| Sinal confirmado / pedido na fila | e-mail | **WhatsApp e e-mail: "Processo X, entrega dia Y"** |
| Mensagem nova | e-mail | WhatsApp e e-mail |
| Dois dias antes, um dia antes ou atraso | — | WhatsApp e e-mail |
| Entrega | e-mail | — |

- **RF-70 (P0)** Modelos de mensagem em português. O corpo não traz dado sensível, só um link para o portal.
- **RF-71 (P0)** Preferências de notificação do André, por evento e canal.
- **RF-72 (P1)** WhatsApp para o advogado, com consentimento, pela API oficial do WhatsApp (D7).

### 7.9 Painel do André

- **RF-80 (P0)** Fila, pedidos, clientes e pastas.
- **RF-81 (P0)** Configurações: tabela de preços e adicionais (versionada), dados de pagamento e textos padrão (proposta e termos).
- **RF-82 (P0)** Ações do André:
  - marcar cliente com contrato;
  - confirmar pagamento manual;
  - ajustar prazo ou valor, com motivo.
- **RF-83 (P1)** Indicadores: cadastros, orçamentos, conversão, receita, prazo médio, entregas no prazo e origem dos acessos.
- **RF-84 (P1)** Ficha do cliente com histórico, processos e avaliações.

### 7.10 Fase operacional com IA (M4 e M5)

- **RF-90 (M4)** Acervo de casos antigos: o André sobe processo, cálculo final e parecer. É a base de avaliação e de regras.
- **RF-91 (M4)** Ingestão:
  - separar as páginas;
  - extrair o texto;
  - detectar páginas escaneadas;
  - gerar imagens dessas páginas.
- **RF-92 (M4)** Detecção de páginas duplicadas e repetidas, por hash do texto e hash perceptual da imagem. Nenhum concorrente faz isso.
- **RF-93 (M4)** Triagem: classifica cada página e propõe o índice de páginas, que o André confirma.
  - **Tipos de página:** inicial, sentença, acórdão, decisões, ficha financeira, cartão de ponto, holerite, custas e cálculos anteriores.
- **RF-94 (M4)** Extração de parâmetros da sentença e do acórdão.
  - **Campos:** datas, verbas deferidas, índices, juros, marco inicial, reflexos e deduções.
  - Cada valor vem com a página e o trecho de onde saiu.
  - O André valida campo a campo, e o valor validado vira decisão técnica (RF-44).
- **RF-95 (M4)** Medição de acurácia por campo contra o acervo, num painel de qualidade.
- **RF-96 (M5)** Cartões de ponto, inclusive manuscritos:
  - leitura para uma tabela (data e até 6 pares de entrada e saída), com confiança por célula;
  - validação determinística;
  - tela de conferência;
  - CSV no layout de importação do PJe-Calc (confirmar no manual vigente).
- **RF-97 (M5)** Motor de regras de juros e correção, determinístico e versionado, com as modulações do André. A IA só sugere qual regra o texto da decisão indica; o André escolhe.
- **RF-98 (M5)** Rascunho do parecer no modelo enxuto do André ("3 páginas resolvem"), com as decisões e páginas de origem. O André edita e assina.
- **RF-99 (P2)** Investigar a geração direta de .PJC.

## 8. Regras de negócio

- **RN-01** Toda proposta discrimina cada serviço e seu valor, e o aceite gera contrato (NBC PG 01, itens 8 e 9).
- **RN-02** Nome, CRC e categoria do responsável técnico aparecem em todas as páginas públicas, propostas, contratos e entregas (NBC PG 01, item 4(r)).
- **RN-03** Nada é entregue sem revisão e assinatura do André. A IA prepara; o André decide e assina (NBC PG 01, item 5(c)). A metodologia fica documentada no registro de decisões (NBC TP 01).
- **RN-04** O pedido só entra na fila com aceite e sinal confirmado, ou com cliente com contrato.
- **RN-05** Prazo prometido ≤ prazo interno ≤ vencimento processual menos a folga.
- **RN-06** O preço sempre vem da tabela versionada. Ajuste manual exige motivo.
- **RN-07** Documentos do processo nunca circulam por WhatsApp. O WhatsApp serve só para avisos.
- **RN-08** Decisão técnica sem fonte (sem página nem confirmação do advogado) fica marcada como "premissa" e aparece assim no parecer.
- **RN-09** Estados do pedido, mudados só pela máquina de estados (testada):
  - **fluxo normal:** rascunho → orçamento → aguardando aceite → aguardando pagamento → na fila → em análise → em cálculo → em revisão → entregue → concluído;
  - **desvios:** aguardando cliente (pausa o prazo? decisão D11), em ajuste (garantia), cancelado, reembolsado.
- **RN-10** Valores em centavos (inteiros) e datas no fuso America/Sao_Paulo.
- **RN-11** Toda leitura e download de arquivo de processo fica registrada na auditoria.

## 9. Modelo de dados inicial

| Entidade | Para quê |
|---|---|
| `profiles` | dados do usuário (ligado ao Auth), papel e consentimentos |
| `clients` | cliente (pessoa, escritório ou empresa), CPF/CNPJ, OAB, flag "com contrato" |
| `processes` | número CNJ, tribunal, vara, partes e lado |
| `orders` | pedido: tipo, área, status, valores, prazos e versão da tabela usada |
| `checklists` | respostas em JSON, validadas pelo schema versionado |
| `price_tables`, `price_items` | tabela de preços versionada e seus itens |
| `quotes` | proposta: itens, total, validade, aceite e PDF |
| `payments` | sinal e saldo: método, status, provedor e IDs externos |
| `files` | bucket, caminho, pasta, versão, hash, páginas e quem enviou |
| `page_index` | índice de páginas por versão do processo |
| `decisions` | decisões técnicas (RF-44) |
| `messages`, `timeline_events` | conversa e linha do tempo da pasta |
| `deadlines` | intimação, tipo de ato, vencimento, prazo interno e ajustes |
| `notifications` | registro de envio por canal |
| `reviews` | avaliações |
| `audit_log` | acessos a arquivos e ações sensíveis |
| `consents` | versões aceitas dos termos e da política |
| M4 e M5: `ai_jobs`, `ai_extractions`, `timecard_rows`, `eval_runs` | jobs de IA, campos extraídos (valor, página, trecho, confiança e validação), linhas de cartão de ponto e medições |

## 10. Requisitos não funcionais

### Segurança

- RLS em todas as tabelas. O servidor usa um papel de banco sem BYPASSRLS, e o navegador nunca fala direto com o banco (padrão do Hub da Harmony).
- Buckets privados, URLs assinadas de curta duração e logs sem dados pessoais.
- Segredos só no 1Password. Os agentes leem apenas o cofre `proj-andre-calculos`, por uma conta de serviço; produção fica nas variáveis da Vercel (§11.7 e `AGENTS.md` §7.1).
- MFA para o André e para a administração (P1).

### LGPD

- **Bases legais:** execução de contrato e exercício regular de direitos em processo judicial (art. 7º, VI, e art. 11, II, "d").
- **Contrato de operador com escritórios** (P1).
- **Retenção:** prazo de guarda definido em D8; exportação e exclusão a pedido.
- **Hospedagem e IA:** banco e funções na região São Paulo (Supabase e Vercel `gru1`); informar na política a transferência internacional quando a IA entrar (M4).

### Qualidade de uso

- **Desempenho:** páginas principais em menos de 2 s no 4G; upload retomável; visualizador de PDF carregado sob demanda.
- **Acessibilidade e idioma:** WCAG 2.2 AA (axe no Playwright), `lang="pt-BR"` e textos em português.
- **Responsividade:** testado em celular (375 px) e computador (1440 px).

### Operação

- **Backups:** backup diário do banco (Supabase Pro) e cópia periódica dos arquivos para fora do Supabase, com teste de restauração mensal.
- **Saúde:** `/api/health` mostra o SHA do commit publicado.
- **Observabilidade:** logs estruturados (pino), trilha de auditoria e alerta de erro.
- **Custos de IA (M4 em diante):** teto por processo e por mês, com registro de uso.

## 11. Stack e ferramentas

Stack decidida em 2026-10-10: Next.js na Vercel e Supabase, ambos em contas novas do cliente. O código fica na organização Harmony-Digital do GitHub.

A coluna **Status** indica:
- *decidido*: escolha do Fábio;
- *padrão*: o mesmo usado no Hub da Harmony;
- *recomendado*: escolha deste PRD, que pode mudar com motivo registrado;
- *decisão*: depende de uma decisão aberta no `plan.md`.

### 11.0 De quem é cada conta

O produto vai ser entregue ao André. Por isso a infraestrutura fica em contas criadas para ele, com um Gmail novo como conta-mãe, e o Fábio constrói e mantém.

| Conta | Dono | Observação |
|---|---|---|
| Gmail novo (conta-mãe) | cliente | 2FA por app autenticador; recuperação no celular e e-mail do André; login no cofre só de pessoas (D14 e D16). Depois, trocar por e-mail do domínio |
| Supabase (organização e projeto `qtofwbxujshroaafxowr`) | cliente | criado pelo Fábio com a conta-mãe |
| Vercel (time e projeto) | cliente | criado pelo Fábio com a conta-mãe |
| Resend, Google (GA4 e Search Console), Meta (WhatsApp), Asaas, Anthropic (M4) | cliente | criados com a conta-mãe conforme cada marco |
| Domínio `.com.br` | cliente | o Registro.br exige CPF ou CNPJ do titular (D3) |
| GitHub (repositório `Harmony-Digital/andre-calculos`) | Harmony | na passagem, transferir para o cliente ou manter com a Harmony na manutenção (D15) |
| 1Password (cofres de construção) e Hub de gestão | Harmony | ferramentas de construção; não fazem parte do produto |

**Regras:**
- Cobrança dos serviços no cartão ou CNPJ do cliente.
- Toda sessão de agente confere que está usando estas contas, e não as de outros clientes do Fábio (`AGENTS.md` §7).
- **Passagem (M3):** o André recebe a conta-mãe e os acessos; as chaves de produção são trocadas; o Fábio continua com acesso para manutenção, se o André quiser.

**Por que não a VPS da Harmony:** um servidor próprio não se entrega a um contador; ele não teria como manter. Com serviços gerenciados no nome do cliente, backup, atualização e segurança do servidor ficam por conta dos fornecedores.

### 11.1 Aplicação

| Camada | Ferramenta | Versão alvo | Status | Por quê |
|---|---|---|---|---|
| Runtime | Node.js | ≥ 22 LTS | padrão | o mesmo do Hub; é o runtime das funções da Vercel |
| Framework | Next.js (App Router) | 16.4 | padrão | server components e server actions; roda nativo na Vercel |
| UI | React | 19.3 | padrão | |
| Linguagem | TypeScript | 5.x | padrão | |
| Estilo | Tailwind CSS v4, shadcn/ui (Radix), lucide-react | 4.x / shadcn 4 | padrão | tokens da marca nova; provisórios até D3 |
| Validação | Zod | 4.x | padrão | schema do checklist versionado; parser puro de `FormData` |
| Formulário em etapas | React Hook Form | atual estável | recomendado | só no checklist |
| Datas e feriados | date-fns 4, `@date-fns/tz`, `date-holidays` | atual estável | recomendado | dias úteis e fuso America/Sao_Paulo; conferir o calendário de feriados na instalação |
| Visualizador de PDF | react-pdf (pdf.js) | atual estável | recomendado | ver o processo no navegador |
| Geração de PDF | `@react-pdf/renderer` | atual estável | recomendado | proposta, registro de decisões e contrato |
| E-mails | React Email com Resend | atual estável | decidido (Resend) | modelos em português |
| Upload retomável | Uppy ou tus-js-client com o TUS do Supabase Storage, direto do navegador | atual estável | recomendado | as funções da Vercel limitam o corpo da requisição a 4,5 MB; o PDF vai direto ao Storage |
| Jobs e agendamentos | Vercel Cron e fila de envios no banco (tabela `notifications`) | — | recomendado | fila transacional existente, lembretes de prazo e reenvio de notificações. Jobs longos de IA (M4) decididos no M4 |
| Logs | pino e os logs da Vercel | 10.x | padrão | |
| Testes | Vitest 5, Playwright 1.62 com `@axe-core/playwright`, ESLint 9, Prettier 3 | conforme Hub | padrão | `npm run check` = format, lint, typecheck, test e build |

### 11.2 Dados e arquivos

| Camada | Ferramenta | Status | Observação |
|---|---|---|---|
| Banco | Supabase Cloud, conta do cliente, projeto `qtofwbxujshroaafxowr` (PostgreSQL) | decidido (D1) | região São Paulo e plano Pro recomendados. O plano grátis pausa projetos parados e limita arquivos a 50 MB; o Pro tem backup diário e arquivos grandes (conferir os limites atuais) |
| Autenticação | Supabase Auth (e-mail e senha, link de acesso) | padrão | a chave pública só serve ao login |
| Arquivos | Supabase Storage: buckets privados e upload retomável (TUS) | recomendado | limite de tamanho por arquivo ajustado no painel (plano Pro) |
| Acesso ao banco | só no servidor, pelo pooler do Supabase (Supavisor), com papel da aplicação sem BYPASSRLS | padrão (Hub) | validar no M1; alternativa: `supabase-js` no servidor com a sessão do usuário (RLS aplicada) |
| Migrations | SQL versionado em `supabase/migrations/`, aplicado pelo MCP `andre-calculos-supabase` ou pela Supabase CLI | padrão | depois de cada uma, rodar os advisors |
| Backups | banco: backup diário do Supabase Pro (PITR opcional). Arquivos: cópia periódica para fora do Supabase, na conta do cliente (por exemplo, Cloudflare R2) | recomendado | confirmar na documentação se o backup do Supabase cobre os arquivos do Storage |
| Desenvolvimento local | Supabase CLI (Docker) com dados fictícios | recomendado | alternativa: o padrão do Hub (PGlite e login de teste) se não houver Docker |

### 11.3 Infraestrutura e entrega

| Item | Ferramenta | Status |
|---|---|---|
| Hospedagem | Vercel na conta do cliente, plano **Pro** (o Hobby é só para uso pessoal não comercial); funções na região São Paulo (`gru1`) | decidido (D2) |
| Repositório | GitHub `Harmony-Digital/andre-calculos`, privado | decidido (D15) |
| CI/CD | Vercel: preview a cada PR, produção pela `main`. GitHub Actions roda o `npm run check` | padrão |
| Domínio e DNS | Registro.br, no CPF do André ou CNPJ da nova empresa; DNS no próprio Registro.br (ou Cloudflare, na conta do cliente) | decisão D3 |
| Segredos | 1Password (cofres da Harmony): desenvolvimento com `op run`; produção nas variáveis de ambiente da Vercel, cadastradas pelo Fábio | padrão |
| Monitoramento | logs e observabilidade da Vercel, `/api/health` com o SHA, alerta de erro por e-mail | recomendado |

### 11.4 Integrações

| Integração | Ferramenta | Marco | Status | Observação |
|---|---|---|---|---|
| E-mail transacional | Resend, conta do cliente | M2 | decidido | verificar o domínio (depende de D3); plano grátis no começo |
| Alertas por WhatsApp ao André | API oficial do WhatsApp (WhatsApp Cloud API) na conta Meta Business do cliente, com número dedicado | M2 | decisão D7 | mensagens de utilidade com modelo aprovado. Alternativa mais rápida: Z-API (não oficial) na conta do cliente. A Evolution API da VPS da Harmony não é do cliente |
| WhatsApp para advogados | a mesma conta oficial | M3 | decisão D7 | consentimento do advogado |
| Pagamentos | Asaas API v3 (sandbox, depois produção): Pix, boleto, cartão, link de pagamento e webhooks | M3 | decisão D9 | no MVP o sinal é manual |
| Analytics | Google Analytics 4, Google Search Console e banner de consentimento, com a conta-mãe | M3 | recomendado | |
| Dados do processo | DataJud (API pública do CNJ) | M3 | recomendado | pré-preenche tribunal, vara, classe e movimentos |
| Assinatura digital | Certificado ICP-Brasil do André, assinatura PAdES no PDF | M2: fora do sistema; M3: validação | decisão D6 | a assinatura gov.br não vale para processo judicial (a Lei 14.063/2020 exclui processos judiciais) |
| PJe-Calc | desktop, usado pelo André fora do sistema | M2; M5 para CSV | — | o portal guarda o .PJC, a versão do PJe-Calc e o mês da tabela |
| Gestão do projeto | Hub da Harmony (MCP e sincronização do `plan.md`) | M1 | padrão | ferramenta da Harmony; ver `AGENTS.md` §10 |

### 11.5 IA (M4 e M5)

| Item | Escolha | Observação |
|---|---|---|
| Provedor e modelo | Anthropic Claude API, conta do cliente, `claude-opus-5-5` | padrão (D12). Usar um modelo mais barato na triagem (por exemplo `claude-haiku-5-5`) é decisão do Fábio, depois de medir custo e acurácia |
| SDK | `@anthropic-ai/sdk` (TypeScript, oficial) | carregar a skill `claude-api` antes de escrever o código |
| Entrada | PDF ou imagens das páginas selecionadas; Files API para reaproveitar arquivos | **limite de 32 MB e 600 páginas por requisição**: nunca enviar o processo inteiro; triagem local primeiro |
| Saída | Saídas estruturadas (`output_config.format`, JSON Schema), com `pagina` e `trecho` em cada campo | o recurso Citations (`page_location`) não funciona junto com saídas estruturadas; por isso a página vem como campo do schema |
| Raciocínio | Pensamento adaptativo, com `effort` explícito por rota (no Opus 5.5 o padrão é `medium`) | streaming para entradas longas |
| Lotes | Message Batches para lotes não urgentes (o acervo, por exemplo) | metade do custo |
| Recusas | Fallback de recusa do lado do servidor (`fallbacks: "default"`) e checagem de `stop_reason` | ver a skill `claude-api` |
| Execução dos jobs longos | decidir no M4: Vercel Workflow ou Queues, Supabase Edge Functions ou worker dedicado na conta do cliente | as funções têm limite de duração; bibliotecas nativas de imagem exigem runtime Node |
| Processamento local | `pdfjs-dist` (texto e renderização), `@napi-rs/canvas` e `sharp` (imagens e hash perceptual) | licenças permissivas; evitar bibliotecas AGPL como o MuPDF |
| Regras de cálculo | Motor determinístico em TypeScript | **a IA nunca calcula valores**: só lê, classifica, extrai e sugere |
| Avaliação | Conjunto de casos antigos do André, com gabarito, e acurácia medida por campo | a skill `claude-api` (`build-eval`) ajuda a montar |
| Privacidade | Enviar só as páginas necessárias; antes do M4, confirmar a política de retenção da Anthropic e pedir retenção zero (ZDR); atualizar a política de privacidade | |
| Custo estimado | Ordem de US$ 1 a 3 por processo com o Opus 5.5, enviando de 60 a 120 páginas | **estimativa**: medir com `count_tokens` no M4 e definir teto |

### 11.6 Ferramentas de desenvolvimento com agentes

| Item | Uso |
|---|---|
| Claude Code (Opus 5.5) | executor principal; o Codex é opcional. Regras em `AGENTS.md`; o `CLAUDE.md` importa esse arquivo |
| MCP `andre-calculos-supabase` | banco, restrito ao projeto `qtofwbxujshroaafxowr` (`.mcp.json`) |
| MCP `andre-calculos-vercel` | hospedagem, na conta do cliente (`.mcp.json`). Depois de criado o projeto, pode ser restrito ao time e ao projeto pela URL |
| MCPs bloqueados neste projeto | `supabase`, `harmony-supabase`, `supabase-leonardo`, `claude_ai_Vercel`, `github`, `hostinger` e `lovable`, porque são contas de outros clientes ou da Harmony (`.claude/settings.json`) |
| GitHub | `gh` com a conta `fabioalmeidadigital`, pelo `GH_TOKEN` (a conta ativa do `gh` é outra) |
| MCP do Hub | gestão de tarefas e sincronização do `plan.md` |
| 1Password CLI (`op` 2.40) | o agente usa só a conta de serviço `sa-andre-calculos-agente`, que só lê o cofre do projeto |
| Preflight | `scripts/preflight.sh`, roda no início de toda sessão pelo hook `SessionStart` |
| Skills | `claude-api` (código que chama o Claude), `vercel:nextjs` (Next.js na Vercel), `frontend-design` (telas), `code-review` e `security-review` (antes de juntar na `main`), `dataviz` (gráficos do painel) |
| Regra | uma sessão de IA por vez no repositório |

### 11.7 Segredos e variáveis de ambiente

**Cofres no 1Password**

| Cofre | O que guarda | Quem lê |
|---|---|---|
| `proj-andre-calculos` | chaves de desenvolvimento e teste, e a chave do Hub | conta de serviço do agente (só leitura) e o Fábio |
| `proj-andre-calculos-prod` (recomendado, D14) | logins das contas do cliente (conta-mãe, Supabase, Vercel, Resend, Registro.br, Meta, Asaas) e chaves de produção | só pessoas; nenhuma conta de serviço |

Em cada cofre há um item por serviço, com campos no nome da variável. O repositório guarda só o `app/.env.tpl`, com referências no formato `NOME=op://proj-andre-calculos/<Item>/<NOME>`.

**Como cada ambiente recebe os segredos**

| Ambiente | Como recebe |
|---|---|
| Desenvolvimento (agentes e Fábio) | `op run --env-file=app/.env.tpl -- npm run dev`, pelo script `scripts/com-segredos.sh`, com a conta de serviço `sa-andre-calculos-agente` |
| Produção (Vercel) | variáveis de ambiente da Vercel (criptografadas), cadastradas pelo Fábio a partir do cofre de produção, à mão ou por script dele (Vercel CLI com `op run`) |
| CI (GitHub Actions) | só checagens; se algum job precisar de segredo, `1password/load-secrets-action` com conta de serviço própria |

**Variáveis**

| Variável | Item no cofre | Para quê |
|---|---|---|
| `APP_BASE_URL` | App | endereço público do app (não é segredo, mas fica junto) |
| `DATABASE_URL` | Supabase | conexão do servidor com o banco, pelo pooler |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | só para o login |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | só no servidor, para o Storage e URLs assinadas |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | e-mail |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_ALERTA`, `ALERTA_WHATSAPP_ANDRE` | WhatsApp | alertas ao André (provedor conforme D7) |
| `CRON_SECRET` | Vercel | protege as rotas chamadas pelo Vercel Cron |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_ENV` | Asaas | pagamentos (M3) |
| `NEXT_PUBLIC_GA_ID` | Google | analytics (M3) |
| `DATAJUD_API_KEY` | DataJud | dados do processo (M3) |
| `ANTHROPIC_API_KEY` | Anthropic | IA (M4) |
| `HUB_API_KEY` | Hub | só no computador de desenvolvimento, para o MCP do Hub; nunca no app |

O token da conta de serviço (`OP_SERVICE_ACCOUNT_TOKEN`) não é variável do app e nunca vai para arquivo. As regras de uso para os agentes estão no `AGENTS.md` §7.1.

### 11.8 Custos mensais (estimativa, pagos pelo cliente)

| Item | Custo |
|---|---|
| Vercel Pro | cerca de US$ 20 por membro por mês, mais uso (conferir) |
| Supabase Pro | cerca de US$ 25 por mês, mais uso (conferir) |
| Resend | grátis no começo |
| Domínio `.com.br` | anual, no Registro.br |
| WhatsApp oficial | por mensagem |
| Asaas | por transação (conferir a tabela atual) |
| GA4, Search Console, DataJud | grátis |
| Certificado ICP-Brasil | o André já tem |
| Claude API (M4 em diante) | por uso, com teto mensal definido no M4 |
| GitHub, 1Password e Hub | Harmony (ferramentas de construção) |

## 12. Riscos

| Risco | Mitigação |
|---|---|
| Prazo de cerca de 10 dias para o MVP | só o P0; sinal manual; assinatura fora do sistema; só trabalhista; lista de corte no `plan.md` |
| Orçamento do checklist impreciso | tabela do André, ajuste manual com motivo e medição da diferença entre orçado e final |
| Desconfiança com o sinal de 50% (caso público de calote no setor) | proposta e contrato com data, status visível, garantia e reembolso publicados, CRC visível |
| Bloqueio do número no WhatsApp não oficial | só alertas internos; e-mail como canal garantido; API oficial para advogados |
| Custo de armazenamento e uso crescer com PDFs grandes | limite por arquivo, política de retenção (D8), alerta de uso no Supabase e na Vercel |
| Agente agir na conta de outro cliente do Fábio | MCPs deste projeto com nomes próprios, MCPs de outras contas bloqueados, preflight no início de toda sessão (`AGENTS.md` §7) |
| Concorrente com muitos usuários lançar "revisão por contador" | registrar dados estruturados (decisões, índices) desde o MVP |
| IA errar ou inventar | página e trecho por campo, validação humana, acurácia medida antes de anunciar |
| Vazamento ou acesso indevido a processo | RLS, buckets privados, URL curta, auditoria, contrato de operador e mínimo de dados para a IA |
| Agente expor uma chave ou senha | cofre só deste projeto, contas de serviço só de leitura, `op run` com mascaramento, proibição de `op read` e `--reveal`, comandos que revelam segredo bloqueados no Claude Code, revogação e troca imediatas |
| Mudança nas regras de juros | motor de regras versionado e registro do regime usado em cada pedido |
| Capacidade do André | fila com limite, urgência controlada e, no futuro, multi-calculista |

## 13. Decisões em aberto

Ficam no `plan.md`, seção "Decisões do Fábio e do André" (D1 a D14). Os agentes trabalham com o padrão recomendado e não decidem pelo Fábio nem pelo André.

## 14. Glossário

| Termo | Significado |
|---|---|
| **Número CNJ** | número único do processo (NNNNNNN-DD.AAAA.J.TR.OOOO) |
| **PJe-Calc / .PJC** | programa oficial de cálculo da Justiça do Trabalho e o arquivo que ele exporta |
| **Liquidação** | apuração do valor devido depois da sentença |
| **Impugnação** | contestação do cálculo da outra parte |
| **Atualização** | refazer o cálculo com índices novos |
| **ADC 58 / Lei 14.905/2024** | regras de correção e juros: IPCA-E com juros antes da ação; Selic até 29/08/2024; IPCA com taxa legal a partir de 30/08/2024 |
| **ICP-Brasil / PAdES** | certificado digital com validade jurídica e o padrão de assinatura dentro do PDF |
| **CRC / CNPC** | registro do contador no conselho regional / Cadastro Nacional de Peritos Contábeis |
| **NBC PG 01 / NBC TP 01** | código de ética do contador / norma de perícia contábil |
| **Sinal** | entrada de 50% |
| **Prazo interno** | data-limite de entrega antes do vencimento processual |
| **Pasta do processo ("raiz")** | área do processo com documentos, mensagens, linha do tempo e decisões |
| **Decisão técnica** | parâmetro escolhido, com origem, página e responsável |
| **Índice de páginas** | mapa das peças do processo para as páginas onde estão |

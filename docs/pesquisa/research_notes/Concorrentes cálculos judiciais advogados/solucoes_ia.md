# Soluções de IA para automação de cálculos judiciais (Brasil, 2026) — mapa de concorrentes, preços, limites e Judiciário

Notas de pesquisa coletadas em 10/10/2026. Salvo indicação contrária, as informações de produto vêm das **páginas dos próprios fornecedores** (alegações de marketing, sem validação independente). Onde a fonte é um blog ou comparativo de terceiros, isso está marcado como "fonte secundária".

---

## 1. Quais lawtechs/ferramentas de IA leem e resumem processos e extraem parâmetros de cálculo? Alguma produz cálculo ou dados prontos para o PJe-Calc?

### Takeaway
Já existe pelo menos um concorrente direto, com a proposta quase idêntica à fase 2 do projeto: o **Calcule AI**, que recebe o PDF inteiro do processo, localiza sentença/acórdão/cartões de ponto/contracheques e devolve um arquivo `.PJC` com memória de cálculo, inclusive via MCP no Claude e no ChatGPT. Também existe o **TrabalhistaIA** (calculotrabalhista.online), que gera `.pjc` a partir da petição/sentença por R$ 97–197/mês. As IAs jurídicas generalistas (Jus IA, Lexter, Jurídico AI, LegJur) resumem e analisam autos, mas não encontrei nenhuma que entregue cálculo ou arquivo PJe-Calc.

### Cited Findings

**Concorrentes diretos (processo → cálculo/PJe-Calc)**

- **Calcule AI** — fluxo declarado: "Envie o processo inteiro, sem separar peças". Identifica petição inicial, sentença, acórdão, cartões de ponto e contracheques, estrutura verbas, períodos e parâmetros "para revisão" e gera "calculo.PJC" e a memória de cálculo em PDF — [Calcule AI](https://www.calculeai.com.br/)
- Calcule AI afirma que o cálculo é "Conferido no PJeCalc antes de você baixar", liquidado "no motor do PJeCalc", "não numa imitação dele" (alegação de marketing, sem prova técnica publicada) — [Calcule AI](https://www.calculeai.com.br/)
- Calcule AI oferece integração **MCP com Claude e ChatGPT**: o usuário envia o processo na conversa e recebe o PJC e a memória em PDF. "O acesso está incluso nos planos com cota mensal". Na página não há preços, razão social, CNPJ nem métrica de acurácia. Copyright 2026 — [Calcule AI](https://www.calculeai.com.br/)
- Calcule AI sobre segurança: dados armazenados em servidores de São Paulo, TLS 1.2+, e a afirmação de que não usa os documentos para treinar IA — [Calcule AI](https://www.calculeai.com.br/)
- **TrabalhistaIA** (calculotrabalhista.online) — cinco agentes de IA em sequência (extração, jurisprudência, cálculo, correção monetária e memória de cálculo). Lê o PDF da reclamação para identificar "partes, datas, verbas e valores". Gera memória em PDF e arquivo `.pjc` para importação no PJe-Calc — [TrabalhistaIA](https://calculotrabalhista.online/)
- TrabalhistaIA declara que aplica a ADC 58/59 do STF (IPCA-E antes da citação, SELIC depois), calcula INSS/IRRF por competência e atualiza índices no dia 15 de cada mês. Diz que o `.pjc` é um XML "seguindo convenções de nomenclatura do PjeCalc 2.x", sem certificação oficial. Usa a tabela INSS 2026 (Portaria MPS/MF 13/2026) e o formato de memória da Res. CSJT 185/2017 — [TrabalhistaIA](https://calculotrabalhista.online/)
- TrabalhistaIA não cita a Lei 14.905/2024 (taxa legal) na página consultada (ausência observada; ver Gaps). Há ainda um modo "Simulação Rápida", sem validade processual — [TrabalhistaIA](https://calculotrabalhista.online/)
- Divergência: um resumo de busca dizia que o calculotrabalhista.online extrai dados de contracheques e cartões de ponto, mas a página, ao ser lida, **não menciona** essa função — [TrabalhistaIA](https://calculotrabalhista.online/)
- **Veritas AI** (TCC acadêmico no GitHub, não é produto comercial) — "extração inteligente de dados processuais para PJe-Calc". A triagem tem 3 camadas: (1) PyMuPDF pontua cada página por palavras-chave e padrões de horário/valor; (2) heurísticas de sumário, páginas vizinhas e densidade, com pdfplumber nas 10 melhores páginas; (3) Gemini (`gemini-3.5-flash-lite`) recebe até 25 páginas candidatas em lotes de 5 e faz OCR das escaneadas. Classifica as páginas como CARTAO_PONTO, HOLERITE ou IRRELEVANTE e gera `.xlsx` em layout provisório, que **não** é o modelo oficial do PJe-Calc. "A acurácia em documentos reais ainda não foi medida". A triagem local leva ~0,2 s num PDF sintético de 300 páginas — [GitHub magal-dev/veritas-ai](https://github.com/magal-dev/veritas-ai)

**IAs jurídicas generalistas (leem e resumem autos; não calculam)**

- **Jus IA (Jusbrasil)** — lançada em mar/2025. Desde 13/04/2026 está incluída em todos os planos do Jusbrasil, sem custo adicional. Cerca de **300 mil advogados por mês** a usam. Acompanha movimentações processuais e sugere ações. O artigo não menciona cálculos — [Conjur, 13/04/2026](https://conjur.com.br/2026-abr-13/ferramenta-de-ia-passa-a-integrar-todos-os-planos-do-jusbrasil/); [Conjur, 19/03/2025](https://conjur.com.br/2025-mar-19/jusbrasil-lanca-ferramenta-de-ia-para-auxiliar-o-trabalho-de-advogados-e-juizes/)
- Jus IA aceita PDF/DOCX de até 150 MB para resumo e análise (resumo de busca da página "Sobre"; não lida diretamente) — [Sobre o Jus IA](https://ia.jusbrasil.com.br/sobre)
- **Jurídico AI** — diz que "analisa contratos e processos", pesquisa jurisprudência e redige peças (marketing) — [Jurídico AI](https://juridico.ai/)
- **LegJur – "Análise Processual IA"** — tem uma função de cálculo chamada "Planilha Viva" ("Chega de refazer o mesmo cálculo todo mês"), a partir de R$ 39,90/mês segundo o resumo de busca. A página devolveu HTTP 403 e não pôde ser lida — [LegJur](https://www.legjur.com/analise-processual-ia); [LegJur Planilha Viva](https://www.legjur.com/analise-processual-ia/planilha-viva)
- Um comparativo de 2026 (fonte secundária) recomenda o Google NotebookLM para analisar PDFs de processo. É uma opinião de blog, sem teste publicado — [Melhor IA Jurídica 2026 (ialocus)](https://ialocus.com.br/blog/post-melhor-ia-juridica-brasil-comparativo-2026.html)

**Literatura/treinamento**

- O livro "Manual de Cálculos Trabalhistas com aplicação ao PJe-Calc" (6ª ed., 2026) tem um capítulo sobre IA, o que sinaliza que o tema já está no mercado de formação de calculistas — [Editora Mizuno](https://www.editoramizuno.com.br/products/livro-manual-de-calculo-trabalhista-pje-calc); [Memória Forense](https://www.memoriaforense.com/produtos/manual-para-calculos-trabalhistas-aplicado-ao-pje-calc-2025/)

### Inferences
- **Inferência:** o Calcule AI é o concorrente mais próximo da fase 2 (PDF inteiro → peças → parâmetros → `.PJC` + memória). O diferencial do projeto do André teria de estar em: (a) revisão por contador CRC responsável (o Calcule AI se vende como ferramenta self-service); (b) detecção de páginas duplicadas e trilha de auditoria página-a-página (nenhum concorrente divulga isso); (c) parecer técnico; (d) fluxo comercial com advogados (fase 1); (e) precisão demonstrada em cartões manuscritos.
- **Inferência:** a existência do TrabalhistaIA a R$ 97–197/mês e do Calcule AI em formato SaaS indica que o "cálculo de IA para o próprio advogado" tende a virar commodity barata. O valor defensável fica na **validação técnica responsável** (assinatura do contador) e na qualidade em processos grandes e bagunçados (300–700+ páginas, escaneados).
- **Inferência:** a arquitetura do Veritas AI (triagem local barata seguida de LLM multimodal só nas páginas candidatas) é um bom modelo de referência para controlar custo em PDFs de 700 páginas.

### Gaps
- Preços, tamanho da base de clientes, empresa responsável e data de lançamento do Calcule AI não foram encontrados. A página "Quem somos" não foi lida.
- Não foi possível verificar se o `.PJC` do Calcule AI ou do TrabalhistaIA importa sem erros em todas as versões do PJe-Calc, nem qual taxa de acerto têm na extração de parâmetros (juros, correção, modulação ADC 58, Lei 14.905/2024).
- Não encontrei dados verificados sobre Turivius, Doc9, Projuris IA, Aurum/Astrea IA, ChatADV, Legal One AI (Thomson Reuters) e o radar AB2L para extração de parâmetros de cálculo. Não houve chamadas suficientes para checá-los. Pela natureza conhecida desses produtos (jurimetria, gestão e peças), é provável que não façam cálculo, mas isso **não foi verificado**.
- Não encontrei nenhuma ferramenta que declare detectar **páginas duplicadas** em autos.

---

## 2. Quais ferramentas ou serviços fazem OCR/digitação de cartões de ponto e holerites para cálculo? Precisão e preço?

### Takeaway
O mercado está dividido em três grupos: (a) **SaaS de IA** para transcrever cartões (Quick Filler, que aceita manuscritos e exporta para Excel, sem preço público nem métrica de acerto); (b) **softwares de apuração manual** que exportam para o PJe-Calc (Avulte, com preços públicos de R$ 45–320/mês ou R$ 18–24 por processo, sem IA); (c) **serviços humanos** de cálculo no PJe-Calc, sem preço público. Nenhum fornecedor publica taxa de acerto medida em cartões manuscritos.

### Cited Findings
- **Quick Filler** (quickfiller.org) — SaaS que transcreve cartões de ponto e holerites com IA. "Funciona com tudo: digital, escaneado, manuscrito em PDF". Diz ter "+1.143 modelos" de cartões e holerites. O usuário escolhe o modelo do cartão, e documentos com mais de um padrão precisam ser separados antes do envio — [Quick Filler](https://quickfiller.org/)
- Quick Filler: exporta "em formato compatível com Excel" e **não menciona importação direta no PJe-Calc**. O usuário revisa os dados antes de usar. Promete reduzir erros "para quase zero" e "Precisão técnica sem alucinações", sem metodologia. Os contadores de uso no site aparecem zerados — [Quick Filler](https://quickfiller.org/)
- Quick Filler, preço: teste grátis de 25 páginas, assinatura mensal, plano anual com 12% de desconto em até 12x, reembolso só nos 7 primeiros dias. **Valores não aparecem na página** — [Quick Filler](https://quickfiller.org/)
- Quick Filler, privacidade: a página diz que o sistema "Coleta, guarda e aprende com tudo que você sobe", não cita a LGPD, e os links de Termos e de Privacidade apontam para a mesma URL. Contato por WhatsApp (16) 99768-4267 — [Quick Filler](https://quickfiller.org/)
- **Avulte – Apuração de Cartão Ponto** (Avulte Ltda) — digitação **manual** de entradas e saídas, com preenchimento automático parametrizável e apuração minuto a minuto ou por tolerância. Exporta para o PJe-Calc em três formatos ("Horários Digitados", "Apuração Mensal" e "Processo Completo" em `.PJC`, do qual se diz o "único sistema" a gerar) e também importa `.PJC` existente. **Não menciona OCR nem IA**. A importação de ponto eletrônico depende de avaliação do layout e é cobrada à parte — [Avulte](https://avulte.com.br/sistemas/cartao-ponto/)
- Avulte, preços (R$): por acesso/mês, Único 45, Básico 80 (2 acessos), Master 175 (5), Premium 320 (10). Por processo, sem validade: Econômico 240 (10 processos), Flex 440 (20), Avançado 600 (30) e Profissional 900 (50), ou seja, R$ 18–24 por processo — [Avulte](https://avulte.com.br/sistemas/cartao-ponto/)
- Uma notícia do SEGS tem o título "Lawtech brasileira desenvolve software para apurar horas extras de cartões de ponto e exporta apurações para o PJe-Calc". A página devolveu 403, e não foi possível confirmar o nome da empresa nem a data — [SEGS](https://www.segs.com.br/info-ti/276581-lawtech-brasileira-desenvolve-software-para-apurar-horas-extras-de-cartoes-de-ponto-e-exporta-apuracoes-para-o-pje-calc)
- **Portal do Calculista** — ferramenta que faz o caminho inverso: extrai os horários de um cálculo PJe-Calc em PDF para CSV — [Portal do Calculista](https://portaldocalculista.com/ferramentas/ferramentas-pje-calc/extrair-horarios-do-pje-calc-pdf)
- **Cálculo Jurídico** diz que seus assistentes de IA extraem dados de "Cartões de ponto" e sentenças, mas a página não traz detalhes de precisão nem de formato de saída (ver Q3) — [Cálculo Jurídico IA](https://calculojuridico.com.br/calculo-juridico-ia/)
- **Calcule AI** diz localizar cartões de ponto e contracheques dentro do processo, mas não detalha se faz OCR de manuscritos — [Calcule AI](https://www.calculeai.com.br/)
- **Ponto de integração oficial:** o PJe-Calc aceita importar uma planilha externa de horários. O manual do PJe-JT mostra a seleção de colunas da "planilha importada pelo usuário", e uma apostila descreve a importação das digitações de cartão de ponto a partir de arquivo externo — [Manual PJe-Calc (PJe-JT)](https://pje.csjt.jus.br/manual/index.php/PJE-Calc); [Apostila PJe-Calc 2.5.5 (Scribd)](https://pt.scribd.com/document/660588568/APOSTILA-PARTE-2-PJECALC-VERSAO-2-5-5)
- Segundo um blog de 2016 (possivelmente desatualizado), os gestores nacionais do PJe-Calc decidiram **não** desenvolver uma ferramenta própria de apuração de cartão de ponto, por causa das diferenças de critérios entre os Regionais. Isso explica o nicho de terceiros — [Personal Jurídico (2016)](http://personaljuridico.blogspot.com/2016/05/planilha-para-apuracao-de-quantidade-em.html)
- **Serviços humanos de cálculo/digitação:** há vários escritórios que vendem cálculo no PJe-Calc feito por pessoas, sem automação por IA comprovada nas páginas: AG Cálculos, calculospjecalc.com, liquidacaodesentenca.com.br, calculocontabil.com.br, pjecalccalculos.com.br e Grupo Qualicont ("Regras Comerciais" PJe-Calc) — [AG Cálculos](https://www.agcalculos.com.br/calculos-trabalhistas); [calculospjecalc.com](https://www.calculospjecalc.com/); [liquidacaodesentenca.com.br](https://liquidacaodesentenca.com.br/); [calculocontabil.com.br](https://calculocontabil.com.br/); [pjecalccalculos.com.br](https://pjecalccalculos.com.br/); [Qualicont](https://www.projetosqualicont.com/pjecalc)
- **Referência de custo da digitação manual** (fonte secundária, de um fornecedor de automação e não do setor jurídico): ~7 minutos por cartão; com um auxiliar a R$ 25/h, dá ~R$ 2,92 por cartão em mão de obra direta. O mesmo fornecedor (imagetotable.ai) tem um guia em PT-BR de extração de folhas de ponto (2026) — [imagetotable.ai](https://imagetotable.ai/pt/blog/complete-guide-timesheet-extraction)

### Inferences
- **Inferência:** nenhum player junta, num único fluxo, **OCR de manuscritos + planilha no layout de importação do PJe-Calc + revisão profissional**. A Quick Filler faz OCR para Excel, a Avulte faz digitação manual para `.PJC`, e o Calcule AI promete o fluxo inteiro, mas sem detalhar manuscritos. Essa é a lacuna mais clara para o projeto.
- **Inferência:** o preço por processo da Avulte (R$ 18–24) e o custo de digitação manual (~R$ 3 por cartão, segundo estimativa de terceiro) servem de piso de referência. Um serviço com IA e validação humana pode cobrar por processo ou por página digitalizada, desde que mostre economia de horas.
- **Inferência:** a exigência da Quick Filler de "escolher o modelo do cartão" e separar padrões diferentes sugere uma abordagem por templates. Cartões fora do padrão, ou manuscritos muito irregulares, provavelmente exigem bastante intervenção.

### Gaps
- Não encontrei **preço público** de serviços humanos de "digitação de cartão de ponto" (por página ou por mês de cartão) nem preços da Quick Filler.
- Nenhuma fonte publica taxa de acerto de OCR de cartões de ponto manuscritos brasileiros.
- Não confirmei o layout exato (colunas e formato) aceito pela importação de horários do PJe-Calc atual. É preciso consultar o manual oficial vigente.

---

## 3. As empresas e softwares de cálculo (Cálculo Jurídico, Jusfy, Previdenciarista) estão adicionando IA? O quê, exatamente?

### Takeaway
Sim, mas em graus diferentes. O **Cálculo Jurídico** é o mais avançado em extração: diz ler cartões de ponto e sentenças, gerar relatórios "em formato PJe-Calc" e transformar cálculos em petições (Voga IA). A **Jusfy** usa "IA" como rótulo da calculadora JusTrabalhista e oferece o chatbot JusGPT, mas não diz ler documentos. O **Previdenciarista** tem o PrevBot, que lê CNIS, voltado ao previdenciário.

### Cited Findings
- **Cálculo Jurídico (CALCULO JURIDICO SOFTWARE LTDA, ecossistema Voga)** — os assistentes de IA extraem dados de "Cartões de ponto" e "Sentenças previdenciárias, cíveis e trabalhistas" e criam "petições a partir dos cálculos" (Voga IA). A página não menciona holerite, ficha financeira, `.pjc` nem parecer. "A partir de R$ 72,67/mês no plano anual", com 8 dias de garantia — [Cálculo Jurídico IA](https://calculojuridico.com.br/calculo-juridico-ia/)
- Em outra página de anúncio, o Cálculo Jurídico promete "Gere relatórios em formato PJe-Calc aceitos pela Justiça" e oferece um assistente de "Estimativa Trabalhista" para iniciais e primeiro atendimento (resumo de busca) — [Cálculo Jurídico IA (ads)](https://calculojuridico.com.br/calculo-juridico-ia-ads/); [Cálculos trabalhistas (ads)](https://calculojuridico.com.br/calculos-trabalhistas-ads/)
- O software trabalhista do Cálculo Jurídico emite um relatório "nos mesmos padrões do Pje-Calc", a partir de R$ 122/mês no plano Prata anual, com cálculos ilimitados (resumo de busca; pode ser outro plano, diferente do de R$ 72,67) — [Cálculo Jurídico software trabalhista](https://calculojuridico.com.br/software-calculos-trabalhistas/)
- **Jusfy – JusTrabalhista**: a FAQ diz que a ferramenta "utiliza inteligência artificial para calcular qualquer verba trabalhista". **Não há upload de documentos.** As horas extras saem do preenchimento manual de entrada e saída. A página não cita exportação para o PJe-Calc. Usa "índices atualizados", sem citar ADC 58, Selic, IPCA-E ou Lei 14.905. Gera PDF e sugere a petição inicial — [Jusfy JusTrabalhista](https://jusfy.com.br/justrabalhista/)
- Planos da Jusfy: Core R$ 77/mês (5 créditos por calculadora, 50 mensagens de IA); Ultimate R$ 117 (20 créditos, 150 mensagens, 3 subusuários); Black R$ 227 (ilimitado, 5 subusuários). Há desconto de 30% para quem é da CAA/OAB — [Jusfy JusTrabalhista](https://jusfy.com.br/justrabalhista/)
- Jusfy **JusGPT**: IA jurídica apresentada como apoio ao advogado, com as decisões sob responsabilidade do usuário (resumo de busca) — [JusGPT](https://jusfy.com.br/jusgpt/); notícia sobre a calculadora trabalhista da Jusfy: [Law Innovation](https://lawinnovation.com.br/jusfy-desenvolve-ferramenta-que-automatiza-calculos-trabalhistas/)
- **Previdenciarista – PrevBot**: o usuário envia o CNIS e o PrevBot "interpreta vínculos, contribuições, tempo especial, quebras de carência e projeções". Fonte: página do fornecedor; não achei preço nem avaliação independente — [Previdenciarista](https://previdenciarista.com/inteligencia-artificial-analisar-calculos-previdenciarios/)
- Um guia de prompts para CNIS avisa que o CNIS é dado pessoal sensível e não deve ser analisado em IA de nuvem gratuita (fonte secundária) — [ialocus – prompt CNIS](https://ialocus.com.br/blog/post-prompt-analise-cnis-ia-2026)

### Inferences
- **Inferência:** os players de cálculo já instalados (Cálculo Jurídico e Jusfy) atendem o **advogado que faz o próprio cálculo**, com preço baixo e foco em volume e petição. Eles não oferecem um serviço técnico assinado por contador. O cliente-alvo do André (o advogado que terceiriza o cálculo) pode estar usando essas ferramentas como alternativa de baixo custo. Esse é o principal risco competitivo.
- **Inferência:** "IA" na JusTrabalhista parece ser só um rótulo de marketing para um motor de regras, já que não há leitura de documentos.

### Gaps
- Não encontrei demonstração em vídeo nem documentação técnica de como o Cálculo Jurídico extrai dados de cartões de ponto (OCR? manuscritos? limites de páginas?).
- Não confirmei se o "formato PJe-Calc" do Cálculo Jurídico é um `.PJC` importável ou só um relatório visualmente parecido. A página de software diz "mesmos padrões", o que sugere a segunda opção.

---

## 4. Modelos de precificação (por página, por processo, assinatura, créditos)

### Takeaway
Predomina a **assinatura mensal com cota ou créditos**, na faixa de R$ 40 a R$ 230/mês para o advogado. O pagamento **por processo** aparece em software de apuração (Avulte, R$ 18–24 por processo) e é a lógica natural dos serviços humanos de cálculo, que não publicam preço. **Por página**, só aparece em testes grátis (Quick Filler, 25 páginas).

### Cited Findings
- TrabalhistaIA: Gratuito R$ 0 (3 cálculos/mês), Básico R$ 97/mês (30 cálculos), Pro R$ 197/mês (ilimitado). PIX ou cartão — [TrabalhistaIA](https://calculotrabalhista.online/)
- Calcule AI: "planos com cota mensal", sem valores publicados, e cadastro gratuito — [Calcule AI](https://www.calculeai.com.br/)
- Jusfy: Core R$ 77, Ultimate R$ 117, Black R$ 227, com créditos por calculadora e mensagens de IA — [Jusfy](https://jusfy.com.br/justrabalhista/)
- Cálculo Jurídico: a partir de R$ 72,67/mês (anual, página de IA) e R$ 122/mês (Prata anual, página de software trabalhista) — [CJ IA](https://calculojuridico.com.br/calculo-juridico-ia/); [CJ software](https://calculojuridico.com.br/software-calculos-trabalhistas/)
- Avulte: por acesso, R$ 45–320/mês; por processo, R$ 240/10 até R$ 900/50 — [Avulte](https://avulte.com.br/sistemas/cartao-ponto/)
- Quick Filler: assinatura mensal ou anual (12% de desconto), teste de 25 páginas, valores não publicados — [Quick Filler](https://quickfiller.org/)
- LegJur: função de cálculo a partir de R$ 39,90/mês (resumo de busca) — [LegJur Planilha Viva](https://www.legjur.com/analise-processual-ia/planilha-viva)
- IAs generalistas (fontes secundárias, preços variam): Jus IA incluída nos planos Jusbrasil (um guia de 2026 cita R$ 78,90 / R$ 108,90 / R$ 208,90; o Conjur de mar/2025 citava R$ 208,90/mês). Lexter, Essencial R$ 199/mês (levantamento de set/2026). Jurídico AI, a partir de R$ 55,92/mês no plano anual. Locus.IA, R$ 149,90 a R$ 1.099,90/mês — [juridicoagil – Jus IA](https://juridicoagil.com/blog/introducao-a-jus-ia-a-revolucao-da-inteligencia-artificial-no-direito); [Conjur 2025](https://conjur.com.br/2025-mar-19/jusbrasil-lanca-ferramenta-de-ia-para-auxiliar-o-trabalho-de-advogados-e-juizes/); [ialocus comparativo 2026](https://ialocus.com.br/blog/post-melhor-ia-juridica-brasil-comparativo-2026.html); [chatjuridico comparativo](https://chatjuridico.com.br/qual-a-melhor-ia-juridica-comparativo-ferramentas/)

### Inferences
- **Inferência:** como o SaaS de cálculo para advogados está ancorado em R$ 70–230/mês, um serviço "IA + contador validando" deve cobrar **por processo/entrega** (com faixas por número de páginas ou meses de cartão) e se posicionar contra o custo do calculista humano, não contra o do SaaS.
- **Inferência:** o custo de LLM multimodal em PDFs de 300–700 páginas pesa na margem. Uma triagem local antes do LLM (como no Veritas AI) ajuda a manter preço por processo competitivo.

### Gaps
- Faltam preços públicos de serviços humanos de cálculo trabalhista e de digitação de cartão de ponto (por processo ou por página) para comparação direta.
- O preço do Calcule AI não foi encontrado.

---

## 5. Limitações e riscos: alucinação, OCR, LGPD/sigilo, aceitação pelos tribunais, responsabilidade profissional (CFC/CRC), OAB, CNJ 615/2025

### Takeaway
Os riscos são concretos e já geram sanções no Brasil: tribunais trabalhistas estão multando por conteúdo inventado por IA (TRT-12, out/2025: R$ 3,7 mil). A OAB tem a Recomendação 001/2024, e o CNJ regula a IA no Judiciário pela Res. 615/2025, com supervisão humana obrigatória. Para o contador, a NBC TP 01 deixa a perícia contábil como competência exclusiva de contador com CRC e exige documentar a metodologia. Não encontrei norma do CFC específica sobre IA. Nenhum fornecedor publica acurácia medida.

### Cited Findings

**Alucinação e sanções**
- **TRT-12 (Vara do Trabalho de Concórdia, notícia de 15/10/2025):** multa de R$ 3,7 mil (5% do valor da causa) por litigância de má-fé. A petição tinha ementas e números de processos inexistentes, um relator que não existe (o nome era de um comerciante de Ponta Grossa/PR) e uma lição falsamente atribuída ao ministro Godinho Delgado. O juiz entendeu que o texto foi gerado por IA sem verificação humana e citou a **Recomendação 001/2024 do CFOAB** — [TRT-12](https://portal.trt12.jus.br/noticias/autora-de-acao-e-multada-apos-advogada-inventar-jurisprudencia-e-desembargador)
- TST, 6ª Turma (10/03/2026): multa de 1% do valor da causa à empresa e ao advogado por precedentes inexistentes ou adulterados. **Fonte secundária** (escritório de advocacia), a conferir — [Barbieri Advogados](https://www.barbieriadvogados.com/inteligencia-artificial-para-advogados/)
- TRT-8: advogadas multadas em R$ 84,2 mil por tentar um "prompt injection" (comando oculto na petição para induzir a IA do tribunal). **Fonte única**, não verificada — [BP Money](https://bpmoney.com.br/?p=401493)
- Estudos de Stanford (RegLab/HAI): LLMs genéricos alucinaram entre 69% e 88% em consultas jurídicas específicas (modelos de 2023). O estudo "Hallucination-Free?" encontrou 17% (Lexis+ AI), 33% (Westlaw AI-Assisted Research) e 43% (GPT-4) em ferramentas de pesquisa jurídica, com modelos de 2024 — [Stanford HAI](https://hai.stanford.edu/news/hallucinating-law-legal-mistakes-large-language-models-are-pervasive); [LLRX, fev/2026](https://www.llrx.com/2026/02/what-the-science-says-about-hallucinations-in-legal-research/)
- Extração de entidades de sentenças (texto impresso, não manuscrito): um LLM open-source fine-tunado chegou a 79,4% de acurácia, contra 86,1% do GPT-4 Turbo. O dado mostra que mesmo texto digital tem erro relevante na extração — [arXiv 2506.08827](https://arxiv.org/pdf/2506.08827)

**OAB**
- O Conselho Pleno da OAB aprovou em **novembro de 2024** as recomendações sobre IA generativa na prática jurídica (Proposição 49.0000.2024.007325-9/COP, relator Francisco Queiroz Caputo Neto). São quatro eixos: Legislação Aplicável; Confidencialidade e Privacidade; Prática Jurídica Ética; Comunicação sobre o Uso de IA Generativa (inclusive com o cliente). O texto **não cria sanções**: é um alerta sobre deveres éticos — [OAB – ementário](https://www.oab.org.br/jurisprudencia/detementa/20761); [OAB SP, 27/11/2024](https://www.oabsp.org.br/jornaldaadvocacia/24-11-27-1725-oab-divulga-recomendacoes-para-uso-da-inteligencia-artificial-ia-na-pratica-juridica); [Correio Braziliense](https://blogs.correiobraziliense.com.br/cbpoder/oab-nacional-aprova-recomendacoes-para-uso-de-ia-na-pratica-juridica/)

**CNJ – Resolução 615/2025**
- Substitui a Res. 332/2020 e vale para todos os tribunais. Classifica as aplicações por risco, exige supervisão humana, transparência, proteção de dados e segurança da informação. Também traz parâmetros para IA generativa e LLMs e cria o Comitê Nacional de IA do Judiciário — [Mattos Filho](https://www.mattosfilho.com.br/unico/uso-inteligencia-artificial-judiciario/); [Parecer IAB, Indicação 22/2025](https://iabnacional.org.br/images/pdfs/pautas/2025_nova/06/INDICAÇÃO%20Nº%2022_2025%20-%20PARECER%20IA%20no%20Judiciário.pdf)
- Magistrados e servidores podem usar IA generativa privada, inclusive com assinatura individual, sem autorização prévia do CNJ, desde que cumpram regras de segurança, capacitação e governança — [Parecer IAB](https://iabnacional.org.br/images/pdfs/pautas/2025_nova/06/INDICAÇÃO%20Nº%2022_2025%20-%20PARECER%20IA%20no%20Judiciário.pdf)
- Datas divergem: publicação em 11/03/2025 segundo IAB e GEN, ou 14/03/2025 com vigência a partir de 14/07/2025 segundo Barbieri. Há um texto compilado no site do CNJ (2026) — [Barbieri](https://barbieriadvogados.com/?p=8838); [GEN Jurídico](https://blog.grupogen.com.br/juridico/tipo/informativo/uso-da-inteligencia-artificial-no-poder-judiciario-ja-e-uma-realidade-e-foi-regulamentada-pelo-cnj-e-outras-noticias-17-03-2025/); [CNJ – compilado](https://atos.cnj.jus.br/files/compilado1719012026040869d68e051ef2d.pdf)
- A Res. 615 regula o **Judiciário**, não advogados nem peritos. Ela é relevante porque os tribunais usam IA (ver Q6) e exigem supervisão humana — [TST, 28/04/2026](https://www.tst.jus.br/-/tst-apresenta-solucoes-de-inteligencia-artificial-em-encontro-nacional-do-judiciario)

**Contador (CFC/CRC)**
- NBC TP 01 (CFC): a perícia contábil judicial, extrajudicial e arbitral é "competência exclusiva de Contador registrado em Conselho Regional de Contabilidade". O laudo deve registrar a metodologia e os critérios adotados, e o perito deve documentar os elementos que sustentam a conclusão. O PDF consultado é de 2016; a norma tem revisões posteriores (R1), que é preciso conferir — [CFC – NBC TP 01](https://cfc.org.br/wp-content/uploads/2016/02/NBC_TP_01.pdf)
- **Não encontrei norma do CFC específica sobre IA.** Há notícia de uma comissão do CFC criada (2019) para discutir impactos e regulamentação de tecnologia, e de uma pesquisa CFC/Fenacon/IOB sobre adoção de IA por contadores. Um blog cita as Res. CFC 1.708/2023 e 1.726/2024 (responsabilidade técnica em serviços digitais), **sem confirmação em fonte oficial** — [CFC – comissão](https://cfc.org.br/pesquisas-academicas-disponiveis/pesquisas-academicas-disponiveis-pesquisas-academicas-disponiveis/comissao-do-cfc-discute-o-impacto-da-tecnologia-na-profissao-contabil); [blog Roberto Dias Duarte (não verificado)](https://www.robertodiasduarte.com.br/?p=112863)

**LGPD/sigilo**
- Calcule AI declara dados no Brasil (São Paulo) e que não treina IA com documentos de clientes. A Quick Filler declara que "Coleta, guarda e aprende com tudo que você sobe". Jus IA: segundo fonte secundária, dados podem ser usados internamente pelo Jusbrasil para melhorar o serviço — [Calcule AI](https://www.calculeai.com.br/); [Quick Filler](https://quickfiller.org/); [ialocus comparativo](https://ialocus.com.br/blog/post-melhor-ia-juridica-brasil-comparativo-2026.html)
- Uso real: um estudo do Jusbrasil com seis seccionais da OAB, a Trybe e o ITS Rio indica que 77% dos profissionais do direito usam IA generativa pelo menos uma vez por semana — [Conjur, 13/04/2026](https://conjur.com.br/2026-abr-13/ferramenta-de-ia-passa-a-integrar-todos-os-planos-do-jusbrasil/)

**Aceitação pelos tribunais**
- O TrabalhistaIA declara que o `.pjc` não é certificado oficialmente. O Calcule AI diz validar no "motor do PJeCalc". Não encontrei manifestação de tribunal aceitando ou rejeitando cálculos gerados por IA — [TrabalhistaIA](https://calculotrabalhista.online/); [Calcule AI](https://www.calculeai.com.br/)
- A ferramenta padrão de cálculo e liquidação na Justiça do Trabalho é o PJe-Calc (Recomendação CGJT nº 4/2018) — [PJe-Calc Cidadão – TRT17](https://www.trt17.jus.br/web/servicos/w/pje-calc-cidadao-); [CSJT – PJe-Calc](https://www.csjt.jus.br/web/csjt/pje-calc)

### Inferences
- **Inferência:** o risco jurídico de um cálculo errado recai sobre quem assina. Por isso, a proposta "IA prepara, contador CRC valida e assina" tem respaldo normativo (NBC TP 01 e a OAB exigindo supervisão) e é um diferencial de confiança frente a SaaS self-service.
- **Inferência:** o sistema deve guardar **rastreabilidade** de cada número (página do PDF de origem → campo extraído → valor no PJe-Calc). Isso atende à exigência da NBC TP 01 de documentar a metodologia e reduz o risco de "alucinação" passar despercebida.
- **Inferência:** para LGPD e sigilo, o diferencial vendável é: provedor de LLM sem retenção nem treinamento, dados no Brasil, contrato de operador de dados com o advogado e descarte após a entrega.

### Gaps
- Não encontrei a íntegra da Recomendação 001/2024 da OAB com o texto de cada item.
- Não encontrei pronunciamento do CFC ou dos CRCs sobre uso de IA em laudos e pareceres, nem jurisprudência sobre cálculos de liquidação gerados por IA.
- Não encontrei benchmark público de OCR/LLM em cartões de ponto manuscritos brasileiros.
- O número do processo e a fonte primária das decisões do TST (10/03/2026) e do TRT-8 não foram confirmados.

---

## 6. O que o próprio Judiciário usa (CSJT/TRT/TST) e que poderia competir ou se integrar

### Takeaway
As IAs da Justiça do Trabalho (Galileu, Chat-JT, Bem-te-vi, Águia) servem para **triagem, resumo e minuta de sentença**, não para cálculo. Não encontrei IA embutida no PJe-Calc nem projeto oficial de OCR de cartão de ponto. O PJe-Calc (TRT-8/CSJT) é o padrão obrigatório de fato, e a forma de integrar é importar planilhas ou gerar `.PJC`.

### Cited Findings
- **Galileu** (TRT-4): IA generativa autorizada para uso em toda a Justiça do Trabalho (notícia de 14/05/2025) para apoiar magistrados na minuta de sentenças. Lê petições e contestações e organiza as informações por tópicos. Não há menção a cálculos — [CSJT](https://www.csjt.jus.br/web/csjt/-/justi%C3%A7a-do-trabalho-adota-nacionalmente-ferramenta-de-ia-galileu-para-auxiliar-a-produ%C3%A7%C3%A3o-de-senten%C3%A7as-na-justi%C3%A7a-do-trabalho); [CNJ](https://www.cnj.jus.br/justica-do-trabalho-adota-ferramenta-de-ia-galileu-para-auxiliar-a-producao-de-sentencas/)
- **Chat-JT** (CSJT): lançado em 03/02/2025 para magistrados, servidores e estagiários. Consulta leis e jurisprudência (Sistema Falcão), bases internas e analisa documentos. É um ambiente corporativo de LLMs gerido pelo CSJT, com privacidade de dados — [CSJT – Chat-JT](https://www.csjt.jus.br/web/csjt/-/chat-jt-justi%C3%A7a-do-trabalho-lan%C3%A7a-intelig%C3%AAncia-artificial-para-auxiliar-profissionais-da-institui%C3%A7%C3%A3o); [TST, 28/04/2026](https://www.tst.jus.br/-/tst-apresenta-solucoes-de-inteligencia-artificial-em-encontro-nacional-do-judiciario)
- **Bem-te-vi** (TST, desde out/2018): faz triagem e agrupamento de processos com temas idênticos, por aprendizado de máquina. **Águia** (TST): resume peças e gera minutas, inspirado no Galileu. O ministro afirma que o voto segue "uma atividade humana" e que o uso de IA observa a Res. CNJ 615. **A notícia não menciona cálculos ou PJe-Calc** — [TST, 28/04/2026](https://www.tst.jus.br/-/tst-apresenta-solucoes-de-inteligencia-artificial-em-encontro-nacional-do-judiciario)
- **PJe-Calc**: desenvolvido pelo TRT-8 a pedido do CSJT, usado em toda a Justiça do Trabalho para cálculo e liquidação. O PJe-Calc Cidadão (desktop/offline) tem as mesmas funções da versão dos tribunais — [CSJT – PJe-Calc](https://www.csjt.jus.br/web/csjt/pje-calc); [TRT17](https://www.trt17.jus.br/web/servicos/w/pje-calc-cidadao-)
- O PJe-Calc consegue consultar a base do PJe e importar os dados das partes a partir do número do processo — [Manual do Usuário PJe-Calc (TRT6)](https://www.trt6.jus.br/portal/sites/default/files/documents/manual_do_usuario_-_pje-calc_0.pdf)
- O TRT-7 mantém uma página de transparência com as soluções de IA adotadas (não lida em detalhe) — [TRT-7 – IA](https://www.trt7.jus.br/index.php/transparencia-secretaria-de-tic/inteligencia-artificial-solucoes-adotadas)

### Inferences
- **Inferência:** a curto prazo, o Judiciário não compete na preparação do cálculo da parte. As ferramentas oficiais servem o juiz. No médio prazo, porém, um Galileu ou Águia que resuma autos pode reduzir o valor percebido de "resumir o processo", o que reforça que o diferencial do projeto deve ser **cálculo + validação técnica + digitação de cartões**.
- **Inferência:** as integrações viáveis são: (1) gerar a planilha de horários no layout de importação do PJe-Calc; (2) gerar ou editar `.PJC`, como fazem a Avulte e o Calcule AI; (3) puxar dados das partes pelo número do processo (função nativa do PJe-Calc).

### Gaps
- Não encontrei notas de versão recentes do PJe-Calc (2025–2026) indicando automação, IA ou novos formatos de importação.
- Não verifiquei se algum TRT tem projeto piloto de IA para conferência de cálculos de liquidação (por exemplo, nas contadorias dos tribunais).
- Benchmarks internacionais (Harvey, ferramentas de extração documental) foram vistos só pelos estudos de alucinação de Stanford. Não pesquisei preço nem funcionalidades do Harvey.

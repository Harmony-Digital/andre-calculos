# Calendário processual

Implementação: `app/src/modules/deadlines/calendar.ts`. Datas civis `AAAA-MM-DD`, sem conversão pelo fuso da máquina. A função exclui o começo e inclui o vencimento; a folga retrocede em dias úteis.

A base nacional contém os feriados previstos no plano. O dia 20 de novembro entra a partir de 2024: a Lei 14.759 foi publicada em dezembro de 2023. O recesso suspende a contagem de 20/12 a 20/01, inclusive. Suspensão de prazo não equivale necessariamente a ausência de expediente.

O preset judicial provisório inclui Carnaval (segunda e terça), Semana Santa (quarta a sexta), 11/8, 1/11 e 8/12. Ele pode ser desativado. A adoção e as regras adicionais do TRT precisam de conferência: quarta-feira de Cinzas, Corpus Christi, feriados municipais, transferências e suspensões extraordinárias entram como intervalos com motivo. Nenhum ponto facultativo do Executivo é convertido automaticamente em suspensão judicial.

`computeDeadline` sempre retorna `requiresTribunalReview: true`. Antes de um prazo ser prometido, registrar o TRT, a unidade, o ano do calendário, a fonte oficial e a conferência do André. O preset é uma estimativa e não autoriza publicação de um vencimento definitivo.

Fontes primárias consultadas em 2026-10-11:

- [CLT, arts. 775 e 775-A](https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm)
- [Lei 14.759/2023](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm)
- [Lei 5.010/1966, art. 62](https://www.planalto.gov.br/ccivil_03/leis/l5010.htm)
- [Calendário do TRT6](https://www.trt6.jus.br/portal/feriados-locais)
- [Feriados municipais do TRT15](https://trt15.jus.br/transparencia/feriados-municipais)

Os testes usam datas de calendário e dados fictícios. A conferência de três casos pelo André continua sendo um critério próprio do plano.

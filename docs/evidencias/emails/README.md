# Modelos locais de e-mail — M2.28a

O renderizador gera assunto, HTML e texto em português para 16 variantes. Usa `react-email` 6.11.1 conforme a [API oficial de renderização](https://react.email/docs/utilities/render). Os onze nomes emitidos atualmente estão cobertos; modelos adicionais ainda sem produtor são preparados para M2.28b.

Marca Marco, André Modelo e CRC DEMO-000000/O · Contador são fictícios. A identidade é validada antes do render; o rodapé demonstrativo aparece em todas as capturas. O renderizador não lê banco e não envia mensagens.

O conteúdo seleciona somente código/número/data civil válidos. Ignora payload bruto, nomes, OAB, cidade, valores, texto de conversa, anexos, destinatário, `role` e caminhos arbitrários. Links são reconstruídos na origem confirmada `https://project-rucji.vercel.app`; mensagem sem papel confiável remete a `/entrar`. Rotas continuam sujeitas ao login e à autorização da aplicação.

Datas são absolutas e não se deslocam por fuso. Avisos de um/dois dias e atraso usam o prazo interno em vez de uma afirmação relativa que pode envelhecer durante retry. Entrega registrada não significa download liberado; o texto preserva a regra pendente de D6.

Validação em 2026-10-11:

- 24 testes específicos: nomes atuais, HTML/texto, referências, injeção, identificadores inválidos, destino arbitrário, datas civis/inválidas, identidade inválida, ausência de dados sensíveis e render repetido determinístico.
- 403 unitários em 39 arquivos, doze testes de scripts e formato/lint/tipos aprovados no `npm run check`. Build local interrompido pelo ambiente na abertura de porta interna do Turbopack; o npm run check/build completo da fonte d065be6f0ffdc2e1f42f015d766ee79430cd5096 passou no job qualidade 114555367460 do CI38168299312.
- 32 testes Playwright aprovados em 10,2 s: 16 modelos em 375/1440 px. Cada render passou por teclado/foco, link esperado, viewport/largura, rodapé, axe A/AA e ausência de requisições HTTP.
- 32 PNG inspecionados visualmente; títulos, código/data, CTA e rodapé legíveis, sem cortes ou sobreposições. Evidências em [celular](celular/) e [computador](computador/).
- Revisão independente de conteúdo e rotas sem bloqueador concreto. Não houve transporte, banco, SMTP, cron ou integração de produção novo.

```sh
cd app
npx vitest run src/modules/notifications/email-content.test.ts src/modules/notifications/email.test.ts
npx playwright test --config playwright.email.config.ts --workers=1
npm run check
```

As capturas verificam renderização no Chromium, não recebimento nem compatibilidade visual em todos os clientes de e-mail. Resend, vínculo dos produtores adicionais, fila/dispatcher, destinatário autorizado, SMTP Auth e ensaio real pertencem a M2.28b/c; a tarefa M2.28 integral permanece aberta no plan.md.

PR [#7](https://github.com/Harmony-Digital/andre-calculos/pull/7) em rascunho, dependente de #6/#5/#4/#3. O job e2e geral do mesmo CI permanece em execução; nenhuma dessas operações novas foi publicada na Vercel.

O audit das dependências foi conferido separadamente em [audit-dependencias.md](../seguranca/audit-dependencias.md). Não foi executado `npm audit fix` nem downgrade automático.

# Modelos locais de autenticação — M2.28d

Três HTMLs nativos e assuntos em português foram preparados com a identidade fictícia Marco, André Modelo e CRC DEMO-000000/O · Contador. Não configuram Supabase Auth/SMTP nem enviam mensagens.

| Nome nativo | Ação | Destino esperado após o callback |
| --- | --- | --- |
| confirmation | Confirmar cadastro | /app |
| magic_link | Acessar minha conta | /app |
| recovery | Escolher nova senha | /nova-senha |

Os arquivos ficam em `supabase/templates/auth/`. `manifest.json` associa nomes, assuntos e HTML; o destino registrado é referência para o ensaio, não configuração de redirect. O gerador preserva o link completo `{{ .ConfirmationURL }}` em botão e alternativa, conforme as [variáveis oficiais](https://supabase.com/docs/guides/auth/auth-email-templates). Não usa `.Data`, token avulso, `RedirectTo` sozinho ou rota `/auth/confirm` inexistente.

O callback existente troca `code` por sessão. O texto orienta usar o mesmo navegador/dispositivo da solicitação, conforme o [fluxo PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow). Não promete validade fixa ou funcionamento entre dispositivos.

Validação local em 2026-10-11:

- Oito testes próprios aprovados, incluindo correspondência entre artefatos/gerador, interpoladores, DOM com URL longa e caracteres especiais, retorno codificado e ausência de atributos injetados; 24 regressões dos modelos transacionais também passaram.
- 38 testes Playwright dos 19 modelos aprovados em 375/1440 px, com foco, contraste/axe A/AA, largura, idioma pt-BR, título único e ausência de requisições HTTP.
- Seis PNG de autenticação inspecionados por QA independente, sem cortes/sobreposições; CTA, alternativa, instruções e identificação legíveis. Capturas em celular/ e computador/.
- O renderizador comum passou a definir idioma do corpo e a evitar o título duplicado criado pelo Preview. Defaults dos avisos transacionais preservados.
- Formato/lint/tipos, 411 unitários e 25 testes de scripts aprovados; build local encontra a restrição de porta interna do Turbopack. O mesmo código passou no `npm run check`/build remoto do [CI38170815863](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38170815863), job qualidade 114562860596, fonte `03b4d778c8cc924ff2a3a25dd04911fb85e7899c` (411 unitários/25 scripts). `@types/jsdom` 30.0.0 foi acrescentado somente para tipar as verificações DOM, sem dependência produtiva nova.

As prévias usam somente URLs sintéticas em `.example.test`, sem tokens reais. A substituição JavaScript verifica um subconjunto fixo do template e não comprova o parser Go, recebimento, SMTP ou autenticação real. Essas provas pertencem ao ensaio autorizado de M2.28c.

```sh
cd app
npm run prepare:auth-emails
npx vitest run src/modules/notifications/auth-email-templates.test.ts
npx playwright test --config playwright.email.config.ts --workers=1
npm run check
```

O gerador resolve o destino a partir do próprio arquivo. O comando npm fixa o tsconfig; na raiz do repositório, usar `npm --prefix app run prepare:auth-emails`, também conferido localmente. Não altera `supabase/config.toml` e não aplica os exemplos de configuração das [instruções oficiais](https://supabase.com/docs/guides/local-development/customizing-email-templates).

Checklist para aplicação e ensaio pelo Fábio, após as autorizações de M2.28c:

1. Confirmar projeto qtofwbxujshroaafxowr, conta/SMTP/destinatário do cliente, origem do portal e allowlist de callback. Substituir identidade fictícia pelos dados aprovados antes de uso comercial.
2. Conferir assunto e HTML correspondentes no manifesto; preservar `ConfirmationURL` sem pré-escape, pipes ou reconstrução. Revisar tracking do provedor e scanners de e-mail, que podem reescrever/consumir links únicos.
3. Ensaiar cadastro, link de acesso e recuperação no navegador solicitante, verificando chegada e destino automático, inclusive /nova-senha. Os testes atuais de Auth têm navegação manual depois do link e não comprovam esse retorno.
4. Ensaiar link reutilizado/expirado, solicitação concorrente e navegador distinto; conferir orientação compreensível e ausência de sessão indevida. Não registrar tokens, URLs completas, cookies ou senhas nas evidências.
5. Verificar renderer real e aparência nas caixas de e-mail autorizadas. As capturas atuais comprovam Chromium; não atestam todos os clientes de e-mail.

O preparo local foi verificado também no build remoto. O mesmo CI concluiu a suíte geral: 315 testes de banco, 159 e2e aprovados/sete omissões planejadas e advisors locais sem achados; SMTP, aplicação dos templates e ensaio real permanecem em M2.28c no plan.md.

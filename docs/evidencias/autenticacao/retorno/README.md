# Retorno automático e falha de link — M2.04c

O callback redirecionava usando a origem interna do Next.js: no ensaio com `127.0.0.1`, o retorno usou `localhost`, separando a navegação do hostname dos cookies. Agora sucesso e falha usam `portalOrigin()`/`APP_BASE_URL`, a mesma origem que gera os e-mails. O filtro de caminho e `private, no-store` foram preservados. A configuração admite HTTPS público e HTTP apenas em localhost/127.0.0.1, recusando outros protocolos e credenciais na URL.

A tela de entrada reconhece apenas `link=invalido`, apresenta aviso fixo em português e abre o formulário de novo link. Orienta recuperar a senha pelo link existente e usar o navegador solicitante. Código, causa interna, URL e parâmetros desconhecidos não viram texto do aviso nem revelam existência de conta.

O helper de Mailpit passou a navegar pelo `Page` uma única vez e observar o destino do callback, sem `page.goto` corretivo para /app ou /nova-senha. Os ensaios capturam os IDs existentes antes da solicitação, selecionam mensagem nova para a caixa exata e apagam somente IDs explícitos; a operação de exclusão vazia é bloqueada, conforme a [API oficial](https://mailpit.axllent.org/docs/api-v1/). Cadastro e jornada completa também usam a navegação real.

Método dos ensaios locais:

- Recuperação chega automaticamente a /nova-senha; senha alterada e login posterior funcionam, com uma auditoria password_changed. Link de acesso chega automaticamente a /app e confere o nome da fixture.
- Código inválido e código de callback consumido são testados em contextos novos que recebem somente o verifier anterior. Nenhum cookie de sessão é copiado. Rejeição, aviso e /app protegido são conferidos.
- Outra fixture recebe link novo, aberto em contexto sem verifier. Rejeição e ausência de sessão são conferidas nos dois navegadores; o segundo usuário evita depender do cooldown do primeiro sem alterar limites do Auth.
- Callback sem código e código fictício, retorno externo, parâmetros desconhecidos, Cache-Control, orientação, formulário aberto, foco, axe A/AA e largura são verificados em 375/1440 px.
- Na repetição final, 18 testes Playwright passaram em 57,5 s; duas omissões planejadas apenas no celular (Mailpit único e cadastro único). A jornada cadastro→download foi repetida nas duas larguras. Os seis ensaios de aviso/parametrização e as oito regressões de login/logout/papéis passaram, assim como recuperação/acesso/replay/outro navegador e cadastro sintético.
- Sete unitários próprios cobrem origem interna/cabeçalhos forjados, caminhos externos/codificados, falha genérica, ausência de origem em produção, protocolos e credenciais. Formato/lint/tipos, 418 unitários e 25 scripts aprovados localmente.

```sh
bash scripts/dev-env.sh npm run test:e2e -- --workers=1 auth-link-errors.spec.ts email-auth.spec.ts auth.spec.ts signup.spec.ts full-journey.spec.ts
cd app
npm run check
```

Todos os usuários/caixas são fictícios no Supabase/Mailpit local exclusivo do projeto. Cookies, códigos e URLs de uso único permanecem em memória; asserções comparam origem/path públicos ou contagens e a navegação sensível apresenta erro fixo. Não anexar URLs, senhas, HTML recebido, cookies ou traces de Auth.

As capturas em computador/ e celular/ mostram somente a página pública de erro e campos vazios. QA visual independente aprovada nas duas recapturas, sem cortes ou sobreposições e com orientação/formulário/foco legíveis. O foco por teclado é conferido antes de voltar a rolagem ao topo para a captura fullPage; isso evita o artefato da ligação fixa de acessibilidade sobre o conteúdo capturado.

Não foram aplicados templates novos nem alterados Auth/SMTP, allowlist, credenciais ou variáveis de produção. Esta evidência não atesta SMTP real nem os modelos nativos de M2.28d: os ensaios de recebimento/renderização desses modelos permanecem em M2.28c. O build local encontra a restrição da porta interna do Turbopack. O mesmo código passou no `npm run check`/build remoto do [CI38171804330](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38171804330), job114565777210, fonte `9843f5df385ef072ab762191bf4e50aaa67e9b85`: 418 unitários/25 scripts, formato/lint/tipos/build aprovados. A suíte geral de banco/navegador desse CI continua em execução; fonte remota preservada.

O CI38171804330 concluiu também a suíte geral na mesma fonte9843f5df385ef072ab762191bf4e50aaa67e9b85: 315 testes de banco/20 arquivos, 165 e2e aprovados/sete omissões planejadas, advisors locais de segurança/desempenho sem achados. Checkout de merge fe9ba1fa0c54290a7ed969bf77d3dd0063aa8745; PR #10 pronto para revisão. Nenhum novo código foi publicado em produção.

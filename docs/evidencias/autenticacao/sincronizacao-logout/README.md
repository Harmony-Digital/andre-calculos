# Evidência da sincronização de logout — M2.35d

O ensaio Mailpit clicava emSair e iniciava nova navegação sem confirmar a conclusão da ação. A corrida foi reproduzida com auditoria atrasada emdois segundos,somente para usuário fictício temporário: cookie de sessão esperado0,recebido1,depois de navegar para recuperação. O atraso pertence exclusivamente ao teste;nenhuma alteração no produto,Auth,SMTP ou usuário real.

O helper agora aguarda origem/caminho deEntrar,confere zero cookies de sessão e confirma queApp protegida retorna aEntrar,antes de outro fluxo. Nenhum cookie é removido pelo teste,não hásleep no helper e os asserts de sessão/acesso protegido foram preservados. As duas saídas do Mailpit usam esse protocolo.

Na repetição final,dez execuções de logout atrasado em375/1440 e cinco do fluxo completo Mailpit passaram semretry. As cinco omissões correspondem somente ao Mailpit móvel preexistente,repetido5vezes;nenhuma omissão nova. Callback inválido,replay,outro navegador,recuperação,troca de senha e link de acesso mantêm suas verificações. A regressão final passou11 casos/uma omissão em18,3s,com asserts de limpeza;inclui as jornadas base de login,área protegida epapéis.

Cada usuário fictício confere sua remoção deperfil/auditoria/grant;cada endereço próprio deMailpit confere mensagens zeradas. Read-back98/25/56RLS/quatro perfis econtroles idênticos aAU,zero grants/perfis/objetos temporários deensaio;dois advisors semachados. Formato/lint/tipos,1441 unidades72arquivos e43scripts aprovados. Build local encontrou EPERM deprocesso/portaTurbopack;fonte/check-build exato remoto ainda necessário. Manifesto preserva hashes de fontes e logs originais/extratos,sem valores de cookies ou URLs de tokens.

Esta correção verifica sincronização do ensaio. Não conclui revisão geral de segurança ou ativação deAuth/SMTP emprodução. O flaky histórico doCI42 foi preservado;sucesso semflaky em fontes posteriores não foi usado como prova isolada da correção.

# Aceite obrigatório no Auth

O cadastro público passa pelo hook do banco mesmo quando a chamada ignora o formulário Next.js. As migrations locais 0047/0048 exigem aceite booleano verdadeiro e duas versões atuais não vazias sob lock. Perfil, cliente, consentimentos, auditoria e aviso são transacionais. Papéis e contrato não vêm de metadata pública.

O bootstrap das fixtures exige concessão privada por UUID, uso único e TTL curto conferido após a espera pelo lock. Nenhum papel da aplicação, inclusive service_role, lê ou concede esses registros; não há RPC. O helper fixa o destino local e accepted_legal=false; um sucesso com UUID exato prova consumo pelo hook. Não grava aceite nem aviso fictícios para contas administrativas.

Comandos executados sequencialmente:

```sh
bash scripts/dev-env.sh npm run test:rls -- tests/integration/signup-legal.test.ts --testTimeout=30000 --hookTimeout=60000
bash scripts/dev-env.sh npm run test:rls -- --testTimeout=30000 --hookTimeout=60000
bash scripts/dev-env.sh npm run test:e2e -- signup.spec.ts account.spec.ts email-auth.spec.ts full-journey.spec.ts --workers=1
```

Evidência em 2026-10-11: 24 testes específicos aprovados em 5,99 s e dezoito arquivos/184 testes da suíte real de banco aprovados em 58,05 s. Negativos sem metadata, false/null/string/number, versão ausente/divergente/objeto, configuração ausente/revogada/vazia, UUID/metadata públicos falsos e grant expirado recusados. Também verificados consumo único, disputa, TTL após lock, rollback após auditoria, ausência de elevação, dois consentimentos, confirmação de e-mail e limpeza de concessão na falha.

A primeira repetição específica encontrou contato de aviso ausente na configuração da fixture; o teste passou a preparar e restaurar esse contato, mantendo a asserção de aviso único. Advisors locais sem achados. npm run check aprovou formato/lint/tipos, 358 unitários e doze scripts; build local recusado pelo ambiente na porta interna do Turbopack. Seis e2e aprovados em 54,2 s (duas omissões de ensaios únicos no celular): cadastro/confirmação, conta/senha, recuperação/link de acesso e jornada completa em 375/1440 px. Revisão independente de SQL/helper sem defeito material restante. O job qualidade do CI [38163619398](https://github.com/Harmony-Digital/andre-calculos/actions/runs/38163619398) aprovou o npm run check completo, incluindo build, da fonte `2cab40d52b7adbd5e2f4e890400049c98fa202a7`. A suíte remota geral de banco/navegador ainda está em execução. PR [#4](https://github.com/Harmony-Digital/andre-calculos/pull/4) em rascunho, dependente de #3.

Textos comerciais, campos completos do transporte Auth (M2.04b), assinatura e habilitação de cadastro real seguem seus requisitos separados. Nenhuma migration ou configuração Auth foi aplicada à nuvem; nenhuma credencial, dado real ou sessão foi salva nesta evidência.

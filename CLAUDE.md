# CLAUDE.md

@AGENTS.md

## Notas específicas do Claude Code

- Este arquivo só importa o `AGENTS.md`, que é a fonte canônica. Edite as regras lá, não aqui.
- **Retomar o trabalho:** abra o Claude Code nesta pasta e peça "continue o projeto". O agente segue o `AGENTS.md` §4: lê "Onde estamos", "Insumos pendentes" e "Ordem de execução" no `plan.md`, escolhe a primeira tarefa disponível e executa a especificação dela. Para fazer uma tarefa específica, peça pelo ID: "faça a M1.30". O `claude --continue` reabre a última conversa, mas o que vale é o `plan.md` e o git, não o histórico do chat.
- **Encerrar o trabalho:** antes de fechar, peça "encerre a sessão". O agente cumpre a parte "Fim" do `AGENTS.md` §4: atualiza o `plan.md`, registra a execução e faz o commit. Assim nada se perde se a sessão terminar no meio de uma tarefa.
- **Skills a carregar quando couber:**
  - `claude-api`: qualquer código que chame o Claude (M4 e M5);
  - `frontend-design`: telas novas;
  - `security-review` e `code-review`: antes de juntar na `main`;
  - `dataviz`: gráficos do painel.
- **Contas:** toda sessão abre com o preflight de contas, injetado pelo hook `SessionStart`. Neste projeto só valem os MCPs `andre-calculos-supabase` e `andre-calculos-vercel`; os MCPs de outras contas estão bloqueados no `.claude/settings.json` (`AGENTS.md` §7). Se um deles pedir login, quem faz é o Fábio, pelo `/mcp`, com a conta nova do cliente.
- **Segredos:** o Claude Code usa só a conta de serviço `sa-andre-calculos-agente`, que lê apenas o cofre `proj-andre-calculos` (`AGENTS.md` §7.1). Rode comandos com segredo pelo `op run` e nunca mostre um valor na conversa. Se o 1Password pedir Touch ID durante a sessão, pare: é a conta pessoal do Fábio.
- **Plan mode** para tarefas que mexem em migrations ou em mais de três arquivos.
- A memória automática do Claude Code complementa, mas não substitui, o `plan.md`.

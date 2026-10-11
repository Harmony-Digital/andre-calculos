#!/usr/bin/env bash
# Preflight de contas (AGENTS.md §7). Roda no início de toda sessão do Claude Code
# pelo hook SessionStart do .claude/settings.json e pode ser rodado à mão:
#   bash scripts/preflight.sh
# Confere GitHub, repositório e 1Password pela linha de comando e lembra o agente
# de conferir os MCPs do Supabase e da Vercel antes do primeiro uso.
# Não imprime nenhum segredo e sempre termina com sucesso (só informa).

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$DIR/scripts/contas-esperadas.env"

linhas=()
alertas=0
ok()   { linhas+=("- OK: $1"); }
erro() { linhas+=("- PROBLEMA: $1"); alertas=$((alertas + 1)); }
info() { linhas+=("- $1"); }

# GitHub: a conta ativa do gh pode ser outra; este projeto usa sempre a do Fábio
if TOKEN_GH="$(gh auth token --user "$GITHUB_USUARIO" 2>/dev/null)"; then
  LOGIN="$(GH_TOKEN="$TOKEN_GH" gh api user --jq .login 2>/dev/null)"
  unset TOKEN_GH
  if [ "$LOGIN" = "$GITHUB_USUARIO" ]; then
    ok "GitHub: conta $GITHUB_USUARIO disponível. Use sempre GH_TOKEN=\"\$(gh auth token --user $GITHUB_USUARIO)\"; a conta ativa do gh é outra"
  else
    erro "GitHub: o token de $GITHUB_USUARIO não respondeu (rede ou login vencido)"
  fi
else
  erro "GitHub: a conta $GITHUB_USUARIO não está logada no gh (gh auth login)"
fi

# Repositório local
if [ -d "$DIR/.git" ]; then
  REMOTO="$(git -C "$DIR" remote get-url origin 2>/dev/null)"
  if [ -z "$REMOTO" ]; then
    info "Git: repositório local sem remoto origin (esperado: $GITHUB_REPO)"
  elif [[ "$REMOTO" == *"$GITHUB_REPO"* ]]; then
    ok "Git: origin aponta para $GITHUB_REPO"
  else
    erro "Git: origin aponta para outro repositório ($REMOTO); esperado $GITHUB_REPO"
  fi
else
  info "Git: repositório ainda não criado nesta pasta (tarefa do M1)"
fi

# 1Password: a conta de serviço do agente deve enxergar só o cofre do projeto
if TOKEN_OP="$(security find-generic-password -a "$USER" -s "$OP_CHAVEIRO" -w 2>/dev/null)"; then
  COFRES="$(OP_SERVICE_ACCOUNT_TOKEN="$TOKEN_OP" op vault list --format=json 2>/dev/null \
    | python3 -c 'import sys, json; print(",".join(sorted(v["name"] for v in json.load(sys.stdin))))' 2>/dev/null)"
  unset TOKEN_OP
  if [ "$COFRES" = "$OP_COFRE" ]; then
    ok "1Password: a conta de serviço enxerga só o cofre $OP_COFRE"
  elif [ -z "$COFRES" ]; then
    erro "1Password: a conta de serviço não respondeu (rede ou token revogado)"
  else
    erro "1Password: a conta de serviço enxerga outros cofres ($COFRES); esperado só $OP_COFRE"
  fi
else
  erro "1Password: token da conta de serviço não encontrado nas Chaves do macOS ($OP_CHAVEIRO); rode scripts/configurar-1password.sh"
fi

# MCPs: o hook não consegue chamar MCP; o agente confere antes do primeiro uso na sessão
if [ -n "$SUPABASE_PROJECT_REF" ]; then
  info "MCP Supabase ($MCP_SUPABASE): restrito ao projeto $SUPABASE_PROJECT_REF. Antes do primeiro uso, chamar get_project_url e conferir que responde https://$SUPABASE_PROJECT_REF.supabase.co. Se responder outro endereço, parar"
else
  info "MCP Supabase ($MCP_SUPABASE): antes do primeiro uso, chamar list_organizations e conferir a organização \"${SUPABASE_ORG:-ainda não registrada}\". Se aparecer organização de outro cliente, parar"
fi
info "MCP Vercel ($MCP_VERCEL): antes do primeiro uso, chamar list_teams e conferir o time \"${VERCEL_TEAM:-ainda não registrado}\". Se aparecer time de outro cliente, parar"
info "Bloqueados neste projeto (contas de outros clientes): $(printf 'mcp__%s ' $MCPS_BLOQUEADOS)"

if [ "$alertas" -eq 0 ]; then
  RESUMO="Preflight andre-calculos: GitHub e 1Password OK; conferir os MCPs antes do uso"
else
  RESUMO="Preflight andre-calculos: $alertas problema(s); ver o contexto antes de qualquer escrita"
fi

TEXTO="$(printf '%s\n' "PREFLIGHT DE CONTAS do projeto $PROJETO (AGENTS.md §7). Se algo não bater, parar e avisar o Fábio antes de qualquer escrita externa." "${linhas[@]}")"

RESUMO="$RESUMO" TEXTO="$TEXTO" python3 -c '
import json, os
print(json.dumps({
  "systemMessage": os.environ["RESUMO"],
  "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": os.environ["TEXTO"]}
}, ensure_ascii=False))'
exit 0

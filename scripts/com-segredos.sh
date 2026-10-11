#!/usr/bin/env bash
# M1.22: token lido somente em memória, conta de serviço exclusiva, saída mascarada pelo op run.
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! OP_SERVICE_ACCOUNT_TOKEN="$(security find-generic-password -a "$USER" -s op-sa-andre-calculos-agente -w 2>/dev/null)"; then
  echo "Conta de serviço do projeto indisponível nas Chaves do macOS." >&2
  exit 1
fi
export OP_SERVICE_ACCOUNT_TOKEN
TASK_VAULTS="$(op vault list --format=json 2>/dev/null | python3 -c 'import json,sys; print(",".join(sorted(v["name"] for v in json.load(sys.stdin))))')"
if [ "$TASK_VAULTS" != proj-andre-calculos ]; then
  echo "Acesso ao cofre não corresponde exclusivamente ao projeto. Comando cancelado." >&2
  exit 1
fi
cd "$TASK_ROOT/app"
exec op run --env-file=.env.tpl -- "$@"

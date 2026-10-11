#!/usr/bin/env bash
# M1.23: preparado pelo agente; execução exclusiva do Fábio, com 1Password pessoal.
set +x
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$TASK_ROOT/scripts/sincronizar-vercel.mjs" "$@"

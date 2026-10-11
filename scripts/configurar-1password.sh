#!/usr/bin/env bash
# Configura o 1Password deste projeto (AGENTS.md §7.1):
#   1. cria o cofre proj-andre-calculos, se não existir;
#   2. cria a conta de serviço sa-andre-calculos-agente com leitura só nesse cofre;
#   3. guarda o token dela nas Chaves do macOS (serviço op-sa-andre-calculos-agente);
#   4. testa que a conta de serviço enxerga só o cofre do projeto.
#
# Roda com a conta do Fábio no 1Password: o app pede Touch ID uma vez.
# Nenhum segredo é impresso. Pode rodar de novo: o que já existe é mantido.
# Uso: bash scripts/configurar-1password.sh
set -euo pipefail

COFRE="proj-andre-calculos"
CONTA_SERVICO="sa-andre-calculos-agente"
CHAVEIRO="op-sa-andre-calculos-agente"

command -v op >/dev/null || { echo "1Password CLI (op) não encontrado. Instale com: brew install 1password-cli"; exit 1; }
if [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
  echo "Rode sem OP_SERVICE_ACCOUNT_TOKEN definido: esta configuração precisa da conta do Fábio."
  exit 1
fi

echo "1/4 Entrando no 1Password (aprove o Touch ID no app)..."
op vault list >/dev/null

echo "2/4 Cofre $COFRE..."
if op vault get "$COFRE" >/dev/null 2>&1; then
  echo "    já existe"
else
  op vault create "$COFRE" \
    --description "Segredos do projeto do André (portal de cálculos judiciais). Harmony Digital." >/dev/null
  echo "    criado"
fi

echo "3/4 Conta de serviço $CONTA_SERVICO (só leitura em $COFRE)..."
if security find-generic-password -a "$USER" -s "$CHAVEIRO" >/dev/null 2>&1; then
  echo "    o token já está nas Chaves do macOS; nada a fazer"
  echo "    (para recriar: apague a conta de serviço no 1Password e o item $CHAVEIRO nas Chaves do macOS)"
else
  TOKEN="$(op service-account create "$CONTA_SERVICO" --vault "$COFRE:read_items" --raw)"
  # O token passa como argumento do security por um instante (visível só para o próprio usuário no ps).
  if ! security add-generic-password -U -a "$USER" -s "$CHAVEIRO" -l "1Password: $CONTA_SERVICO" -w "$TOKEN"; then
    unset TOKEN
    echo "    ERRO ao guardar o token. Apague a conta de serviço $CONTA_SERVICO no 1Password e rode de novo."
    exit 1
  fi
  unset TOKEN
  echo "    criada; token guardado nas Chaves do macOS ($CHAVEIRO)"
fi

echo "4/4 Testando a conta de serviço..."
SA_TOKEN="$(security find-generic-password -a "$USER" -s "$CHAVEIRO" -w)"
COFRES="$(OP_SERVICE_ACCOUNT_TOKEN="$SA_TOKEN" op vault list --format=json \
  | python3 -c 'import sys, json; print(",".join(v["name"] for v in json.load(sys.stdin)))')"
unset SA_TOKEN
echo "    a conta de serviço enxerga: $COFRES"
if [ "$COFRES" = "$COFRE" ]; then
  echo "OK: a conta de serviço lê só o cofre $COFRE."
else
  echo "ATENÇÃO: esperado só o cofre $COFRE. Revise as permissões da conta de serviço."
  exit 1
fi

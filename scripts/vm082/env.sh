#!/usr/bin/env bash
# Mexe no .env da VM sem mostrar nenhum valor. É o caminho para quem não deve
# ver os segredos, inclusive um assistente de código: o que ele lê vai para
# fora do servidor.
#
#   scripts/vm082/env.sh listar          nomes e se cada um está preenchido
#   scripts/vm082/env.sh definir NOME    pede o valor sem mostrar o que se digita
#   scripts/vm082/env.sh definir NOME VALOR
#   scripts/vm082/env.sh gerar NOME      grava um segredo aleatório novo
#
# Ver docs/servidor-vm082.md.
set -euo pipefail
source "$(dirname "$0")/comum.sh"

[[ -f .env ]] || falha "falta o .env na raiz do projeto. Ele vem da máquina anterior: ver docs/servidor-vm082.md."

nome_valido() {
  [[ "${1:-}" =~ ^[A-Z][A-Z0-9_]*$ ]] || falha "nome de variável inválido: '${1:-}'. Use letras maiúsculas, números e _."
}

case "${1:-}" in
  listar)
    # Compara com o .env.example para mostrar também o que falta: variável
    # ausente costuma ser o motivo de um container que não sobe.
    nomes=$( { grep -oE '^[A-Z][A-Z0-9_]*=' .env; grep -oE '^[A-Z][A-Z0-9_]*=' .env.example; } | tr -d = | sort -u)
    for n in $nomes; do
      if ! grep -qE "^$n=" .env; then
        estado="falta (existe no .env.example)"
      elif [[ -n "$(valor_env "$n")" ]]; then
        estado="preenchida"
      else
        estado="vazia"
      fi
      printf '  %-34s %s\n' "$n" "$estado"
    done
    ;;
  definir)
    nome_valido "${2:-}"
    if [[ $# -ge 3 ]]; then
      valor=$3
    else
      read -rsp "Valor de $2 (não aparece na tela): " valor
      echo
    fi
    definir_no_env "$2" "$valor"
    echo "$2 gravada no .env"
    ;;
  gerar)
    nome_valido "${2:-}"
    definir_no_env "$2" "$(openssl rand -hex 32)"
    echo "$2 gravada no .env com um segredo novo de 64 caracteres. Se ela tem par em outro lugar (credencial do n8n, Vercel), troque lá também: ver docs/armadilhas.md"
    ;;
  *)
    sed -n '6,9p' "$0" | sed 's/^# //'
    exit 1
    ;;
esac

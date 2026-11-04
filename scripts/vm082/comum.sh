# shellcheck shell=bash disable=SC2034
# Trechos usados pelos scripts da VM082. Não roda sozinho: é carregado com
# `source` pelos outros.

PASTA_VM082=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$PASTA_VM082/../.." || exit 1

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.vm082.yml)

falha() { echo "ERRO: $*" >&2; exit 1; }

# Lê uma variável do .env sem executá-lo: `source .env` quebraria com segredo
# que tenha $, aspas ou espaço, e rodaria o que estivesse escrito nele.
valor_env() {
  grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

# Código HTTP de um POST sem token. Um webhook publicado e protegido responde 403.
codigo_post() {
  curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST "$1" || true
}

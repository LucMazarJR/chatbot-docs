#!/usr/bin/env bash
# Sobe o chatbot na VM082. Pode rodar de novo a qualquer momento: o que já está
# no ar e não mudou continua como está.
#
#   scripts/vm082/instalar.sh                 n8n, redis e túnel
#   scripts/vm082/instalar.sh --com-whatsapp  e também o gateway do WhatsApp
#   scripts/vm082/instalar.sh --com-pwa       e também o PWA, que envia os avisos push
#   scripts/vm082/instalar.sh --forcar        sobe mesmo com o túnel atendido por outra máquina
#
# Ver docs/servidor-vm082.md.
set -euo pipefail
source "$(dirname "$0")/comum.sh"

servicos=(redis n8n cloudflared)
forcar=0
for arg in "$@"; do
  case "$arg" in
    --com-whatsapp) servicos+=(whatsapp-gateway) ;;
    --com-pwa) servicos+=(pwa) ;;
    --forcar) forcar=1 ;;
    *) falha "opção desconhecida: $arg" ;;
  esac
done

docker info >/dev/null 2>&1 \
  || falha "sem acesso ao Docker. O DTI precisa rodar 'sudo gpasswd -a $USER docker'; depois saia e entre de novo no servidor."

[[ -f .env ]] || falha "falta o .env na raiz do projeto. Ele vem da máquina anterior: ver docs/servidor-vm082.md."

# Outros usuários do servidor não podem ler os segredos. 640 deixa o grupo da
# equipe ler, para que outra pessoa consiga reiniciar os containers.
perm=$(stat -c %a .env)
[[ "$perm" == 600 || "$perm" == 640 ]] \
  || falha ".env com permissão $perm, legível por qualquer usuário do servidor. Rode: chmod 640 .env"

[[ -n "$(valor_env CLOUDFLARE_TUNNEL_TOKEN)" ]] \
  || falha "CLOUDFLARE_TUNNEL_TOKEN vazio no .env. Sem ele o túnel fica reiniciando e nada chega ao n8n."

url=$(valor_env CLOUDFLARE_URL)
[[ -n "$url" ]] || falha "CLOUDFLARE_URL vazio no .env. O n8n usa esse endereço para montar as URLs dos webhooks."

# Dois cloudflared com o mesmo token dividem as conversas entre as duas
# máquinas, e metade cai num n8n que não é este. Se o túnel responde algo
# diferente de 530 (sem máquina conectada), outra máquina ainda o atende.
if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx cloudflared; then
  codigo=$(codigo_post "$url/webhook/pwa-chat")
  if [[ "$codigo" != 530 && "$forcar" == 0 ]]; then
    falha "o túnel $url respondeu $codigo: outra máquina ainda está conectada a ele. Pare o cloudflared e o n8n lá antes (docs/servidor-vm082.md), ou rode com --forcar se tiver certeza."
  fi
fi

[[ "$(valor_env COMPOSE_FILE)" == docker-compose.yml:docker-compose.vm082.yml ]] \
  || echo "AVISO: falta COMPOSE_FILE=docker-compose.yml:docker-compose.vm082.yml no .env. Sem ela, um 'docker compose' digitado à mão sobe com volumes vazios e portas abertas."

[[ -n "$(valor_env N8N_VERSAO)" ]] \
  || echo "AVISO: N8N_VERSAO vazio no .env, o n8n sobe na versão mais nova. Na migração, use a versão da máquina anterior."

"${COMPOSE[@]}" config -q
"${COMPOSE[@]}" pull --ignore-buildable "${servicos[@]}"
"${COMPOSE[@]}" up -d --build "${servicos[@]}"

echo
echo "Containers no ar. Conferindo:"
exec "$PASTA_VM082/verificar.sh"

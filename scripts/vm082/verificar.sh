#!/usr/bin/env bash
# Confere o chatbot na VM082 de ponta a ponta: containers, n8n, fluxo publicado,
# túnel e portas expostas. Só lê; não muda nada. Sai com código 1 se algo falhar.
#
#   scripts/vm082/verificar.sh
set -uo pipefail
source "$(dirname "$0")/comum.sh"

falhas=0
ok()   { echo "  ok    $*"; }
erro() { echo "  FALHA $*"; falhas=$((falhas + 1)); }

echo "Containers"
for s in redis n8n cloudflared; do
  if "${COMPOSE[@]}" ps --status running --services | grep -qx "$s"; then
    ok "$s no ar"
  else
    erro "$s parado. Veja: ${COMPOSE[*]} logs --tail 50 $s"
  fi
done

saude=$(docker inspect -f '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q redis)" 2>/dev/null || echo ausente)
if [[ "$saude" == healthy ]]; then
  ok "redis saudável"
else
  erro "redis com saúde '$saude'. Confira REDIS_PASSWORD no .env"
fi

echo "n8n"
if curl -fsS -m 10 http://127.0.0.1:5678/healthz >/dev/null 2>&1; then
  ok "responde em 127.0.0.1:5678 ($("${COMPOSE[@]}" exec -T n8n n8n --version 2>/dev/null | tail -n 1))"
else
  erro "não responde em 127.0.0.1:5678. Veja os logs do n8n: permissão no volume ou versão diferente da original aparecem lá"
fi

# 403 é o esperado: a rota existe e recusa quem não apresenta o token. 404 quer
# dizer fluxo despublicado, o que acontece depois de importar pelo CLI.
codigo=$(codigo_post http://127.0.0.1:5678/webhook/pwa-chat)
case "$codigo" in
  403) ok "fluxo do chat publicado e protegido por token" ;;
  404) erro "fluxo do chat não publicado (404). Ver docs/armadilhas.md, 'Importar workflow pelo CLI o desativa'" ;;
  *)   erro "webhook do chat respondeu $codigo, esperado 403" ;;
esac

echo "Túnel"
url=$(valor_env CLOUDFLARE_URL)
codigo=$(codigo_post "$url/webhook/pwa-chat")
case "$codigo" in
  403) ok "$url chega ao n8n" ;;
  530) erro "$url sem máquina conectada (530). Veja: ${COMPOSE[*]} logs --tail 50 cloudflared" ;;
  *)   erro "$url respondeu $codigo, esperado 403" ;;
esac

echo "Portas"
# Nenhuma porta do chatbot pode ficar aberta para a rede da prefeitura: o túnel
# fala com o n8n por dentro do compose.
abertas=$(ss -tln | awk '{print $4}' | grep -E '^(0\.0\.0\.0|\[::\]|\*):(3000|5432|5678|6379|8080)$' || true)
if [[ -z "$abertas" ]]; then
  ok "nenhuma porta do chatbot aberta para a rede"
else
  erro "portas abertas para a rede: ${abertas//$'\n'/ }. Confira se o docker-compose.vm082.yml entrou no comando"
fi

echo
if [[ "$falhas" == 0 ]]; then
  echo "Tudo certo."
else
  echo "$falhas verificação(ões) falharam."
  exit 1
fi

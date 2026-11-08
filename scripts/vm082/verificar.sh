#!/usr/bin/env bash
# Confere o chatbot na VM082 de ponta a ponta: containers, n8n, fluxo publicado,
# entrada pública e portas expostas. Só lê; não muda nada. Sai com código 1 se algo falhar.
#
#   scripts/vm082/verificar.sh
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

falhas=0
ok()   { echo "  ok    $*"; }
erro() { echo "  FALHA $*"; falhas=$((falhas + 1)); }

# Lê uma variável do .env sem executá-lo: `source .env` quebraria com segredo
# que tenha $, aspas ou espaço. O \r sai junto porque o .env vem de uma máquina
# Windows: o Docker o ignora, mas aqui ele grudaria no valor, e endereço e
# comparação falhariam com uma mensagem embaralhada.
valor_env() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | tr -d "\"'\r"; }
# Código HTTP de um POST sem token. Um webhook publicado e protegido responde 403.
codigo_post() { curl -s -o /dev/null -w '%{http_code}' -m 15 -X POST "$1" || true; }

echo "Configuração"
if [[ "$(valor_env COMPOSE_FILE)" == docker-compose.yml:docker-compose.vm082.yml ]]; then
  ok "COMPOSE_FILE inclui a sobreposição da VM"
else
  erro "falta COMPOSE_FILE=docker-compose.yml:docker-compose.vm082.yml no .env. Sem ela, o docker compose sobe com volumes vazios e portas abertas"
fi

echo "Containers"
for s in redis n8n; do
  if docker compose ps --status running --services | grep -qx "$s"; then
    ok "$s no ar"
  else
    erro "$s parado. Veja: docker compose logs --tail 50 $s"
  fi
done

echo "n8n"
n8n="127.0.0.1:$(valor_env N8N_PORTA)"
[[ "$n8n" == "127.0.0.1:" ]] && n8n=127.0.0.1:3811
if curl -fsS -m 10 "http://$n8n/healthz" >/dev/null 2>&1; then
  ok "responde em $n8n"
else
  erro "não responde em $n8n. Veja os logs do n8n: permissão no volume ou versão diferente da original aparecem lá"
fi

# 404 quer dizer fluxo despublicado, o que acontece depois de importar pelo CLI.
codigo=$(codigo_post "http://$n8n/webhook/pwa-chat")
case "$codigo" in
  403) ok "fluxo do chat publicado e protegido por token" ;;
  404) erro "fluxo do chat não publicado (404). Ver docs/armadilhas.md, 'Importar workflow pelo CLI o desativa'" ;;
  *)   erro "webhook do chat respondeu $codigo, esperado 403" ;;
esac

echo "Entrada pública"
url=$(valor_env N8N_URL_PUBLICA)
if [[ -z "$url" ]]; then
  ok "N8N_URL_PUBLICA vazia: o n8n só é alcançado pelo túnel SSH, e o chat da Vercel fica sem resposta"
else
  codigo=$(codigo_post "$url/webhook/pwa-chat")
  if [[ "$codigo" == 403 ]]; then
    ok "$url chega ao n8n"
  else
    erro "$url respondeu $codigo, esperado 403. Confira a rota do proxy e o N8N_HOST_IP no .env"
  fi
fi

echo "Portas"
# Nenhuma porta do chatbot pode ficar aberta a toda a rede da prefeitura: o
# proxy alcança o n8n pelo IP da VM, nunca por 0.0.0.0.
abertas=$(ss -tln | awk '{print $4}' | grep -E '^(0\.0\.0\.0|\[::\]|\*):(3810|3811|3812|5510)$' || true)
if [[ -z "$abertas" ]]; then
  ok "nenhuma porta do chatbot aberta para a rede"
else
  erro "portas abertas para a rede: ${abertas//$'\n'/ }. Confira o COMPOSE_FILE no .env"
fi

echo
if [[ "$falhas" == 0 ]]; then
  echo "Tudo certo."
else
  echo "$falhas verificação(ões) falharam."
  exit 1
fi

#!/usr/bin/env bash
# Roda na VM082, na raiz do projeto. Recria os volumes a partir da pasta que o
# exportar-volumes.ps1 gerou na máquina antiga e põe o .env no lugar.
#
#   scripts/vm082/importar-volumes.sh ~/migracao-chatbot
#
# Ver docs/servidor-vm082.md.
set -euo pipefail
origem=$(cd "${1:?informe a pasta com os .tgz, ex.: ~/migracao-chatbot}" && pwd)
cd "$(dirname "$0")/../.."

falha() { echo "ERRO: $*" >&2; exit 1; }

docker info >/dev/null 2>&1 \
  || falha "sem acesso ao Docker. O seu usuário precisa estar no grupo docker; depois de incluído, saia e entre de novo no servidor."

shopt -s nullglob
pacotes=("$origem"/*.tgz)
[[ ${#pacotes[@]} -gt 0 ]] || falha "nenhum .tgz em $origem."

# Volume com dado não é sobrescrito: importar de novo por engano apagaria o que
# a VM já gravou depois da migração.
for p in "${pacotes[@]}"; do
  v=$(basename "$p" .tgz)
  if docker volume inspect "chatbot-docs_$v" >/dev/null 2>&1; then
    falha "o volume chatbot-docs_$v já existe. Se é para trocar mesmo, pare os containers e apague com 'docker volume rm chatbot-docs_$v'."
  fi
done

for p in "${pacotes[@]}"; do
  v=$(basename "$p" .tgz)
  # Com estas etiquetas o Compose reconhece o volume como dele. Sem elas, ele
  # avisa a cada subida que o volume "não foi criado pelo Compose".
  docker volume create \
    --label com.docker.compose.project=chatbot-docs \
    --label com.docker.compose.volume="$v" \
    "chatbot-docs_$v" >/dev/null
  # Extraído como root, o tar mantém o dono de cada arquivo. O n8n roda como o
  # usuário node (1000) e não abre o próprio banco se os arquivos forem de root.
  docker run --rm -v "chatbot-docs_$v:/destino" -v "$origem:/origem:ro" alpine \
    tar xzpf "/origem/$v.tgz" -C /destino
  echo "chatbot-docs_$v importado"
done

if [[ -f .env ]]; then
  echo "AVISO: já existe um .env aqui, e o da pasta não foi copiado."
else
  [[ -f "$origem/env" ]] || falha "falta o arquivo env em $origem."
  # 640: o grupo da equipe lê, para outra pessoa conseguir reiniciar os
  # containers; o resto dos usuários do servidor não.
  install -m 640 "$origem/env" .env
  versao=$(tr -d '[:space:]' < "$origem/n8n-versao.txt")
  # COMPOSE_FILE faz o `docker compose` digitado à mão incluir a sobreposição da
  # VM. Sem ela, o projeto ganharia o nome da pasta, com volumes novos e vazios,
  # e as portas ficariam abertas para a rede da prefeitura.
  printf '\n# --- VM082 ---\nN8N_VERSAO=%s\nCOMPOSE_FILE=docker-compose.yml:docker-compose.vm082.yml\n' "$versao" >> .env
  echo ".env copiado, com N8N_VERSAO=$versao (a da máquina antiga) e COMPOSE_FILE"
fi

echo
echo "Próximo passo: docker compose up -d redis n8n cloudflared"
echo "Depois de verificado, apague $origem: ali estão os segredos e as conversas guardadas no n8n."

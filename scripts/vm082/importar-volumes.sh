#!/usr/bin/env bash
# Roda na VM082. Recria os volumes a partir da pasta que o exportar-volumes.ps1
# gerou na máquina antiga, e põe o .env no lugar. Depois disso, o instalar.sh
# sobe tudo. Ver docs/servidor-vm082.md.
#
#   scripts/vm082/importar-volumes.sh ~/migracao-chatbot
set -euo pipefail
origem=$(cd "${1:?informe a pasta com os .tgz, ex.: ~/migracao-chatbot}" && pwd)
source "$(dirname "$0")/comum.sh"

docker info >/dev/null 2>&1 \
  || falha "sem acesso ao Docker. O DTI precisa rodar 'sudo gpasswd -a $USER docker'; depois saia e entre de novo no servidor."

shopt -s nullglob
pacotes=("$origem"/*.tgz)
[[ ${#pacotes[@]} -gt 0 ]] || falha "nenhum .tgz em $origem."

# Volume com dado não é sobrescrito: importar de novo por engano apagaria o que
# a VM já gravou depois da migração.
for p in "${pacotes[@]}"; do
  v=$(basename "$p" .tgz)
  if docker volume inspect "chatbot-docs_$v" >/dev/null 2>&1; then
    falha "o volume chatbot-docs_$v já existe nesta máquina. Se é para trocar mesmo, pare os containers e apague com 'docker volume rm chatbot-docs_$v'."
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

if [[ -f "$origem/env" ]]; then
  if [[ -f .env ]]; then
    echo "AVISO: já existe um .env aqui; o da pasta não foi copiado."
  else
    install -m 640 "$origem/env" .env
    echo ".env copiado (permissão 640)"
  fi
fi

if [[ -f "$origem/n8n-versao.txt" ]]; then
  versao=$(tr -d '[:space:]' < "$origem/n8n-versao.txt")
  definir_no_env N8N_VERSAO "$versao"
  echo "N8N_VERSAO=$versao no .env, a mesma da máquina antiga"
fi

# Faz o `docker compose` digitado à mão incluir a sobreposição da VM. Sem ela, o
# projeto ganharia o nome da pasta, com volumes novos e vazios, e as portas
# ficariam abertas para a rede da prefeitura.
definir_no_env COMPOSE_FILE docker-compose.yml:docker-compose.vm082.yml
echo "COMPOSE_FILE no .env: o docker compose puro já usa a sobreposição da VM"

echo
echo "Próximo passo: scripts/vm082/instalar.sh"
echo "Depois de verificado, apague $origem: ali estão os segredos e as conversas guardadas no n8n."

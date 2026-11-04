# Roda na máquina ANTIGA (Windows com Docker Desktop), na raiz do projeto.
# Para o chatbot lá e empacota os volumes e o .env numa pasta, para levar à
# VM082 com o importar-volumes.sh. Ver docs/servidor-vm082.md.
#
#   powershell -ExecutionPolicy Bypass -File scripts\vm082\exportar-volumes.ps1
#   ... -ComWhatsApp   leva também a sessão do WhatsApp
#
# O chatbot fica PARADO ao final, de propósito: se voltasse, o túnel teria duas
# máquinas e o n8n antigo seguiria gravando execuções que não chegam à VM.
# Para desistir e voltar a máquina antiga: docker compose start redis n8n cloudflared
param([switch]$ComWhatsApp)
$ErrorActionPreference = 'Stop'

$raiz = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $raiz
if (-not (Test-Path .env)) { throw "Falta o .env em $raiz. Rode na pasta do projeto da maquina de producao." }

# Pasta sem acento nem espaço: a pasta do projeto fica em "Área de Trabalho", e
# o scp e o Docker tropeçam nesse caminho.
$destino = Join-Path $env:USERPROFILE 'migracao-chatbot'
if (Test-Path $destino) { throw "$destino ja existe, de uma exportacao anterior. Apague a pasta antes de exportar de novo." }
New-Item -ItemType Directory $destino | Out-Null

$volumes = @('n8n_data', 'redis_data')
if ($ComWhatsApp) { $volumes += 'wa_sessions' }

# A versão vai junto porque a VM precisa subir a mesma: ver N8N_VERSAO no
# docker-compose.vm082.yml.
# Lida da etiqueta da imagem, e não do `n8n --version`, para funcionar também
# com o container parado. O \" é necessário: o PowerShell 5.1 tira as aspas
# de dentro do argumento, e o docker recusa o modelo ("function org not defined").
$idN8n = docker compose ps -a -q n8n
if (-not $idN8n) { throw "Container do n8n nao encontrado. Rode na pasta do projeto da maquina de producao." }
$versao = "$(docker inspect $idN8n --format '{{index .Config.Labels \"org.opencontainers.image.version\"}}')".Trim()
if (-not $versao) { throw "Nao consegui ler a versao do n8n." }
Set-Content -Path (Join-Path $destino 'n8n-versao.txt') -Value $versao -Encoding ascii
Write-Host "n8n na versao $versao"

# Parar antes de copiar: o n8n e o redis escrevem nos volumes o tempo todo, e
# uma cópia com eles no ar pode sair com o banco do n8n pela metade.
$servicos = @('cloudflared', 'n8n', 'redis')
if ($ComWhatsApp) { $servicos = @('whatsapp-gateway') + $servicos }
docker compose stop @servicos
if ($LASTEXITCODE -ne 0) { throw "docker compose stop falhou." }

foreach ($v in $volumes) {
  $nome = "chatbot-docs_$v"
  docker volume inspect $nome *> $null
  if ($LASTEXITCODE -ne 0) { throw "Volume $nome nao existe nesta maquina." }
  docker run --rm -v "${nome}:/origem:ro" -v "${destino}:/destino" alpine tar czf "/destino/$v.tgz" -C /origem .
  if ($LASTEXITCODE -ne 0) { throw "Falha ao empacotar $nome." }
  Write-Host "$v empacotado"
}

Copy-Item .env (Join-Path $destino 'env')

Write-Host ""
Write-Host "Pronto em $destino. Ali estao os segredos e as conversas guardadas no n8n:"
Write-Host "apague a pasta assim que a VM estiver verificada."

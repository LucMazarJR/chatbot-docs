# Servidor da prefeitura (VM082)

A VM082 é a máquina da Prefeitura de Franca dedicada ao chatbot. Ela roda o n8n e o Redis. O chat e o painel que as pessoas abrem ficam na Vercel. O que quebra em silêncio está em [armadilhas.md](armadilhas.md#servidor-vm082).

| | |
|---|---|
| Endereço | `172.21.31.182`, só dentro da rede da prefeitura |
| SSH | porta `22022`, usuário e senha do AD, sem domínio |
| Sistema | Ubuntu 24.04, 8 vCPU, 31 GB de RAM, 490 GB de disco, Docker com `docker compose` |
| Pasta do projeto | `/home/lucianojunior/chatbot/chatbot-docs` |
| Responsável no DTI | Ricardo David |

O [docker-compose.franca.yml](../docker-compose.franca.yml) e o [mapa de portas](mapa-portas-172-21-31-167.md) são de **outro** servidor (`172.21.31.167`) e não valem aqui.

## Acesso

Conecte a VPN da prefeitura (WatchGuard, servidor `170.231.100.140:8443`, usuário e senha do AD) e entre por SSH, ou pelo Remote-SSH do VS Code:

```
Host servidor-prefeitura
    HostName 172.21.31.182
    Port 22022
    User fulano.silva
```

`servidor-prefeitura` é só um apelido, e existe apenas para quem tem esse bloco no próprio `~/.ssh/config`. Sem ele, o `ssh` responde "could not resolve hostname". Os manuais do DTI trazem o IP `172.21.3.182`, que está errado.

### Testar do seu computador

O n8n e o PWA só escutam em `127.0.0.1` da VM. Para abrir os dois, com a VPN conectada, use um túnel SSH. O comando completo, que funciona sem o apelido:

```bash
ssh -p 22022 -L 8080:127.0.0.1:3812 -L 5678:127.0.0.1:3811 fulano.silva@172.21.31.182
```

Ele pede a senha do AD. Enquanto esse terminal estiver aberto, o chat fica em `http://localhost:8080` e o editor do n8n em `http://localhost:5678`. Só o computador de quem abriu o túnel alcança esses endereços.

## Como funciona

* **Não há túnel do Cloudflare na VM.** A entrada de fora é o proxy do DTI ([Entrada pública](#entrada-pública)). Até ele ser ligado, o n8n só é alcançado pelo túnel SSH, e o chat da Vercel fica sem resposta.
* **O [docker-compose.vm082.yml](../docker-compose.vm082.yml) se sobrepõe ao compose principal.** Ele fixa o nome do projeto e a versão do n8n e prende as portas ao `127.0.0.1`. A linha `COMPOSE_FILE=docker-compose.yml:docker-compose.vm082.yml` no `.env` faz o `docker compose` usá-lo sempre.
* **O gateway do WhatsApp e o PWA não sobem por padrão.** O canal do WhatsApp está pausado, e o chat fica na Vercel. O PWA só precisa subir se os avisos push forem usados, porque o relógio que os envia roda nele ([notificacoes-push.md](notificacoes-push.md#o-relógio)).

## Outras instalações na VM

A VM roda também instalações do usuário `petsaude`, que não são esta: `petsaude-correlacao` (um clone deste repositório, em `/home/petsaude/chatbot/chatbot-docs`) e `infra-ia` (outro projeto, com n8n, PWA, Evolution API e o Nginx Proxy Manager nas portas 80 e 443). Não mexa nelas. Elas já ocupam estas portas do host:

| Porta | Quem usa |
|---|---|
| 80, 443, 81 | Nginx Proxy Manager (`infra-npm`) |
| 5432, 5678, 8080, 8081 | `infra-ia` |
| 3801, 3802, 5534 | `petsaude-correlacao` |

Por isso, o `.env` desta instalação define portas próprias:

```ini
N8N_PORTA=3811
PWA_PORT=3812
```

Antes de subir, confira que estão livres: `ss -tln | grep -E ':(3811|3812)\s'` não pode mostrar nada.

## Migrar da máquina anterior

**1. Na máquina anterior** (Windows), na pasta do projeto, no terminal da própria máquina. Por SSH, o Docker do Windows não baixa imagens.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\vm082\exportar-volumes.ps1
```

O script para o túnel, o n8n e o Redis e copia os volumes, o `.env` e a versão do n8n para `%USERPROFILE%\migracao-chatbot`. O chatbot fica parado ao final, de propósito: dois túneis no ar dividem as conversas entre as duas máquinas.

**2. Leve a pasta até a VM**, passando por um computador que alcance as duas:

```bash
scp -r maquina-anterior:migracao-chatbot .
scp -r migracao-chatbot servidor-prefeitura:
```

**3. Na VM**, na pasta do projeto:

```bash
scripts/vm082/importar-volumes.sh ~/migracao-chatbot
docker compose up -d redis n8n
scripts/vm082/verificar.sh
```

O importador cria os volumes, põe o `.env` com permissão 600 (só o dono lê), esvazia as variáveis do túnel da máquina anterior e acrescenta a `N8N_VERSAO` e o `COMPOSE_FILE`. O verificador confere os containers, o n8n, o fluxo do chat, a entrada pública e as portas, e cada falha diz onde olhar.

**4. Apague a pasta `migracao-chatbot`** nos três lugares. Ela tem os segredos e as perguntas guardadas nas execuções do n8n.

### Voltar para a máquina anterior

```bash
docker compose stop n8n                      # na VM
```

```powershell
docker compose start redis n8n cloudflared   # na máquina anterior, na pasta do projeto
```

## Atualizar

```bash
cd ~/chatbot/chatbot-docs
git pull --no-edit github main
docker compose up -d redis n8n
scripts/vm082/verificar.sh
```

O `origin` dessa pasta é o Gitness da prefeitura, cujo certificado a VM não reconhece, e por isso a atualização vem do remoto `github`. O n8n só muda de versão quando a `N8N_VERSAO` do `.env` muda. Antes de subir a versão, faça uma cópia do volume do n8n: a versão nova converte o banco, e ele não volta para a antiga.

## Entrada pública

A entrada é um proxy do DTI, com domínio da prefeitura, que encaminha só os caminhos `/webhook/` para o n8n da VM. O editor não pode ficar público. Para ligar:

1. No `.env` da VM, `N8N_HOST_IP=172.21.31.182`, e depois `docker compose up -d n8n`. O proxy roda num container e não alcança o `127.0.0.1` do host.
2. Com o proxy pronto, confira o endereço novo: `curl -X POST https://<domínio>/webhook/pwa-chat` precisa responder 403.
3. No `.env` da VM, `N8N_URL_PUBLICA=https://<domínio>`, e depois `docker compose up -d n8n`.
4. Na Vercel, `N8N_PWA_WEBHOOK_URL` e `N8N_PWA_STAGING_WEBHOOK_URL` passam a usar o domínio, seguidos de um redeploy.

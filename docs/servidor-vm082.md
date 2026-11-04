# Servidor da prefeitura (VM082)

A VM082 é a máquina da Prefeitura de Franca dedicada ao chatbot. Ela roda o n8n, o Redis e o túnel. O chat e o painel que as pessoas abrem ficam na Vercel. O que quebra em silêncio está em [armadilhas.md](armadilhas.md#servidor-vm082).

| | |
|---|---|
| Endereço | `172.21.31.182`, só dentro da rede da prefeitura |
| SSH | porta `22022`, usuário e senha do AD, sem domínio |
| Sistema | Ubuntu 24.04, 8 vCPU, 31 GB de RAM, 490 GB de disco, Docker com `docker compose` |
| Pasta do projeto | `/srv/chatbot-petsaude` |
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

Os manuais do DTI trazem o IP `172.21.3.182`, que está errado. O n8n só escuta em `127.0.0.1` da VM. Para abrir o editor, use `ssh -L 5678:127.0.0.1:5678 servidor-prefeitura` e acesse `http://localhost:5678`.

## Como funciona

* **A entrada de fora é o túnel do Cloudflare.** O `cloudflared` só abre conexão de saída, e por isso funciona de dentro da rede da prefeitura sem regra no firewall. Nenhuma porta da VM fica aberta para a rede.
* **O [docker-compose.vm082.yml](../docker-compose.vm082.yml) se sobrepõe ao compose principal.** Ele fixa o nome do projeto e a versão do n8n e prende as portas ao `127.0.0.1`. A linha `COMPOSE_FILE=docker-compose.yml:docker-compose.vm082.yml` no `.env` faz o `docker compose` usá-lo sempre.
* **O gateway do WhatsApp e o PWA não sobem por padrão.** O canal do WhatsApp está pausado, e o chat fica na Vercel. O PWA só precisa subir se os avisos push forem usados, porque o relógio que os envia roda nele ([notificacoes-push.md](notificacoes-push.md#o-relógio)).

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

**3. Na VM**, em `/srv/chatbot-petsaude`:

```bash
scripts/vm082/importar-volumes.sh ~/migracao-chatbot
docker compose up -d redis n8n cloudflared
scripts/vm082/verificar.sh
```

O importador cria os volumes, põe o `.env` com permissão 600 (só o dono lê) e acrescenta a `N8N_VERSAO` e o `COMPOSE_FILE`. O verificador confere os containers, o n8n, o fluxo do chat, o túnel e as portas, e cada falha diz onde olhar.

**4. Apague a pasta `migracao-chatbot`** nos três lugares. Ela tem os segredos e as perguntas guardadas nas execuções do n8n.

### Voltar para a máquina anterior

```bash
docker compose stop cloudflared n8n          # na VM
```

```powershell
docker compose start redis n8n cloudflared   # na máquina anterior, na pasta do projeto
```

## Atualizar

```bash
cd /srv/chatbot-petsaude
git pull
docker compose up -d redis n8n cloudflared
scripts/vm082/verificar.sh
```

O n8n só muda de versão quando a `N8N_VERSAO` do `.env` muda. Antes de subir a versão, faça uma cópia do volume do n8n: a versão nova converte o banco, e ele não volta para a antiga.

## Trocar o túnel pela entrada da prefeitura

A entrada definitiva é um proxy do DTI, com domínio da prefeitura, que encaminha só os caminhos `/webhook/` para o n8n da VM. O editor não pode ficar público. As duas entradas funcionam juntas, então a troca não tira o chat do ar:

1. No `.env` da VM, `N8N_HOST_IP=172.21.31.182`, e depois `docker compose up -d n8n`. Assim o proxy, que está em outra máquina, alcança a porta 5678. Com o túnel, ela fica presa ao `127.0.0.1`.
2. Com o proxy pronto, confira o endereço novo: `curl -X POST https://<domínio>/webhook/pwa-chat` precisa responder 403.
3. Na Vercel, `N8N_PWA_WEBHOOK_URL` e `N8N_PWA_STAGING_WEBHOOK_URL` passam a usar o domínio novo, seguidos de um redeploy. No `.env` da VM, `CLOUDFLARE_URL` também recebe o domínio novo, porque o n8n monta as URLs dos webhooks com ele, e depois `docker compose up -d n8n`.
4. Só então desligue o túnel: `docker compose stop cloudflared`. A partir daí, sobe-se só `redis n8n`, e o `verificar.sh` passa a acusar o `cloudflared` parado, o que é esperado.

Para voltar, basta pôr as URLs antigas de novo na Vercel e subir o `cloudflared`.

# Servidor da prefeitura (VM082)

A VM082 é a máquina da Prefeitura de Franca dedicada ao chatbot. Ela roda o "cérebro" (n8n, Redis e o túnel), e o chat que as pessoas abrem continua na Vercel. Para entender as peças, ver [arquitetura.md](arquitetura.md). O que quebra em silêncio está em [armadilhas.md](armadilhas.md#servidor-vm082).

| | |
|---|---|
| Endereço | `172.21.31.182`, só dentro da rede da prefeitura |
| SSH | porta `22022`, usuário do AD sem domínio (ex.: `fulano.silva`) e a senha do AD |
| Sistema | Ubuntu 24.04, 8 vCPU, 31 GB de RAM, 490 GB de disco |
| Docker | já instalado, com o plugin `docker compose` |
| Internet | saída direta, sem proxy |
| Responsável no DTI | Ricardo David |

O [docker-compose.franca.yml](../docker-compose.franca.yml) e o [mapa de portas](mapa-portas-172-21-31-167.md) são de **outro** servidor (`172.21.31.167`, compartilhado com outras aplicações) e não valem aqui.

---

## Acesso

1. Conecte a VPN da prefeitura (WatchGuard Mobile VPN, servidor `170.231.100.140:8443`, usuário e senha do AD). Com ela conectada, o ícone fica verde.
2. Entre por SSH. No `~/.ssh/config`:

   ```
   Host servidor-prefeitura
       HostName 172.21.31.182
       Port 22022
       User fulano.silva
   ```

   No VS Code, a extensão Remote-SSH usa o mesmo arquivo.

Os manuais do DTI trazem o IP `172.21.3.182`, que está errado, e mostram o IP no campo Port do PuTTY. No Windows, o `ssh` recusa o `~/.ssh/config` quando outro usuário do computador tem acesso ao arquivo ("Bad owner or permissions"). Corrija com `icacls` tirando esse usuário da pasta `.ssh`.

### Editor do n8n

O n8n escuta só em `127.0.0.1` da VM. Para abrir o editor, use um túnel SSH:

```bash
ssh -L 5678:127.0.0.1:5678 servidor-prefeitura
```

Com ele aberto, o editor fica em `http://localhost:5678` no seu computador.

---

## O que roda e o que não roda

| Serviço | Na VM | Por quê |
|---|---|---|
| `redis`, `n8n`, `cloudflared` | sim | o fluxo, a memória das conversas e a entrada de fora |
| `whatsapp-gateway` | só com `--com-whatsapp` | o canal do WhatsApp está pausado ([prototipo-pwa.md](prototipo-pwa.md#em-uso-e-em-validação)) |
| `pwa` | só com `--com-pwa` | o chat público fica na Vercel, mas o relógio que envia os avisos push só roda neste container ([notificacoes-push.md](notificacoes-push.md#o-relógio)). Sem ele no ar em lugar nenhum, os avisos ficam na fila e vencem |
| `postgres`, `dashboard-*` | não | o painel fica na Vercel |

### Entrada pública

A Vercel chama o n8n pelo túnel do Cloudflare (`CLOUDFLARE_URL`). O `cloudflared` só abre conexão de **saída**, e por isso funciona de dentro da rede da prefeitura sem regra no firewall. Nenhuma porta da VM fica aberta para a rede: o túnel fala com o n8n por dentro do compose.

O projeto tem um domínio da prefeitura. Para usá-lo no lugar do túnel, o DTI aponta o domínio para a entrada pública da prefeitura e encaminha **só os caminhos `/webhook/`** para o n8n da VM. O editor não pode ficar público. Depois disso:

1. Na Vercel, `N8N_PWA_WEBHOOK_URL` e `N8N_PWA_STAGING_WEBHOOK_URL` passam a usar o domínio novo.
2. No `.env` da VM, `CLOUDFLARE_URL` recebe o domínio novo, porque o n8n monta as URLs dos webhooks com ele.
3. A porta do n8n no [docker-compose.vm082.yml](../docker-compose.vm082.yml) passa a aceitar o endereço do proxy da prefeitura, e o `cloudflared` sai do `instalar.sh`.

---

## Permissões que dependem do DTI

O seu usuário precisa entrar no grupo `docker`, e a equipe precisa de uma pasta comum:

```bash
sudo groupadd petsaude
sudo gpasswd -a fulano.silva petsaude
sudo gpasswd -a fulano.silva docker
sudo mkdir /srv/chatbot-petsaude
sudo chgrp petsaude /srv/chatbot-petsaude
sudo chmod 2775 /srv/chatbot-petsaude
```

* Os usuários vêm do AD, não do `/etc/passwd`, e por isso o `usermod -aG` responde que o usuário não existe. O `gpasswd -a` funciona.
* O `2` do `2775` faz todo arquivo criado na pasta pertencer ao grupo `petsaude`. Sem ele, um colega não edita o que o outro criou.
* Quem está no grupo `docker` tem, na prática, poder de root na máquina.
* O grupo novo só vale numa sessão nova: saia e entre de novo. No VS Code, rode "Remote-SSH: Kill VS Code Server on Host" e conecte de novo.

O projeto vai em `/srv/chatbot-petsaude`, e não na home de alguém: se a conta dessa pessoa for desativada, o serviço continua com dono.

---

## Migrar da máquina anterior

A máquina anterior é um Windows com Docker Desktop. Os dados que importam estão nos volumes do n8n (fluxos, credenciais e o histórico de execuções) e do Redis (memória das conversas), mais o `.env`.

**1. Na máquina anterior**, na pasta do projeto, com o Docker Desktop aberto na sessão do usuário (por SSH, o Docker do Windows não consegue baixar imagens):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\vm082\exportar-volumes.ps1
```

O script para o túnel, o n8n e o Redis, empacota os volumes e copia o `.env` e a versão do n8n para `%USERPROFILE%\migracao-chatbot`. O chatbot fica **parado** ao final. Se voltasse, o túnel teria duas máquinas, e o n8n antigo seguiria gravando execuções que não chegam à VM. Para levar também a sessão do WhatsApp, acrescente `-ComWhatsApp`.

**2. Leve a pasta até a VM.** A máquina anterior não alcança a VPN da prefeitura, então a pasta passa por um computador que alcança as duas:

```bash
scp -r maquina-anterior:migracao-chatbot .
scp -r migracao-chatbot servidor-prefeitura:
```

**3. Na VM**, com o repositório em `/srv/chatbot-petsaude`:

```bash
scripts/vm082/importar-volumes.sh ~/migracao-chatbot
scripts/vm082/instalar.sh
```

O importador recusa sobrescrever um volume que já existe, põe o `.env` com permissão 640 e grava no `.env` a `N8N_VERSAO` da máquina anterior e o `COMPOSE_FILE`. O instalador se recusa a subir enquanto o túnel ainda responde pela máquina anterior.

**4. Apague a pasta `migracao-chatbot` nos três lugares** (máquina anterior, computador do meio e VM) depois da verificação. Ela tem os segredos e as perguntas guardadas nas execuções do n8n.

### Voltar para a máquina anterior

Se a VM der problema depois da troca:

```bash
# na VM
docker compose stop cloudflared n8n
```

```powershell
# na máquina anterior, na pasta do projeto
docker compose start redis n8n cloudflared
```

O que a VM gravou depois da troca (execuções, memória de conversa) fica só nela.

---

## Instalar do zero

Sem máquina anterior: clone o repositório em `/srv/chatbot-petsaude`, crie o `.env` a partir do [.env.example](../.env.example) (ver [instalacao.md](instalacao.md#1-o-env)) com permissão 640 e com:

```ini
COMPOSE_FILE=docker-compose.yml:docker-compose.vm082.yml
```

Depois rode `scripts/vm082/instalar.sh` e importe os fluxos no n8n (ver [instalacao.md](instalacao.md)).

---

## Conferir

```bash
scripts/vm082/verificar.sh
```

O script só lê. Ele confere os containers, a saúde do Redis, o n8n e a versão dele, o fluxo do chat publicado e protegido (`403` sem token), o túnel chegando ao n8n e se alguma porta do chatbot ficou aberta para a rede. Sai com código 1 se algo falhar, e cada falha diz onde olhar.

---

## Atualizar

```bash
cd /srv/chatbot-petsaude
git pull
scripts/vm082/instalar.sh
```

O n8n só muda de versão quando a `N8N_VERSAO` do `.env` muda. Antes de subir a versão, faça uma cópia do volume do n8n: a versão nova converte o banco, e ele não volta para a antiga.

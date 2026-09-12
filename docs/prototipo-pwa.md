# Protótipo PWA de validação

Interface web com cara de WhatsApp, que roda **o mesmo fluxo de RAG** do canal em produção, pede uma nota ao final e registra tudo para análise.

Existe por um motivo prático: validar a **qualidade das respostas** com usuários reais. Pelo WhatsApp isso é ruim de fazer — exige parear um número, ninguém consegue observar a interação, e as conversas não são guardadas (decisão deliberada, ver [depende-de-voce.md](depende-de-voce.md#7-lgpd--dado-de-saúde-é-dado-sensível)).

> ⚠️ **Aqui as conversas SÃO gravadas.** É o objetivo do protótipo, e por isso a tela de entrada avisa o participante e pede que não informe dado pessoal. Ao fim da validação, [apague a base](#ao-fim-da-validação).

---

## O que ele não toca

O canal em produção continua igual. O isolamento é de ponta a ponta:

| | WhatsApp (produção) | Protótipo PWA |
|---|---|---|
| Fluxo n8n | [whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json) | [pwa-chatbot.json](../n8n/pwa-chatbot.json) |
| Rota | `/webhook/whatsapp` | `/webhook/pwa-chat` |
| Token | `N8N_WEBHOOK_TOKEN` | `N8N_PWA_WEBHOOK_TOKEN` |
| Credencial Gemini | `Felipe Gemini` (`GEMINI_API_KEY`) | `Gemini PWA` (`GEMINI_API_KEY_2`) |
| Memória Redis | chave = `chatId` (`...@lid`) | chave = `pwa:<sessão>` |
| Conversas | não persistidas | `pwa_prototipo` no Mongo |

**Compartilhado de propósito:** a base de FAQs (`ministerio_saude.faq_medicamentos`), o modelo de embedding, o modelo de chat, o `systemMessage` do agente e o limiar de score. Divergir em qualquer um deles faria o protótipo medir outro produto.

```
                    ┌───────────────────────────────┐
  Participante      │        pwa  (Next.js)         │
  (celular)         │                               │
     │  mensagem    │  route handlers               │
     ├─────────────►│        │                      │
     │              └────────┼──────────────────────┘
     │                       │ POST + X-Webhook-Token
     │                       ▼
     │              ┌───────────────────────────────┐
     │              │   n8n — /webhook/pwa-chat     │
     │              │   Dados → Buscar FAQs →       │
     │              │   Montar contexto → AI Agent  │
     │              │     ├─ MongoDB Vector Store   │  ← mesma base de FAQs
     │              │     ├─ Redis Chat Memory      │
     │              │     └─ Gemini (chave _2)      │
     │              └────────┬──────────────────────┘
     │                       │ quando termina, devolve em
     │                       ▼ POST /api/n8n/resposta
     │◄────────────  grava em  pwa_prototipo
     (a tela vai            sessoes · mensagens
      consultando)                 ▲
                                   │
  Equipe ──► Dashboard-PetSaúde ───┘
             /conversas (login + papel admin)
```

Nenhuma requisição fica aberta esperando: o fluxo responde ao **receber**, e devolve o resultado quando termina. É o que permite uma resposta levar três minutos sem bater em teto de plataforma nenhum.

---

## Como subir

### 1. Variáveis no `.env`

```powershell
# gere um token distinto dos demais
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

```ini
PWA_PORT=8080
PWA_MONGO_DB=pwa_prototipo
N8N_PWA_WEBHOOK_URL=http://n8n:5678/webhook/pwa-chat
N8N_PWA_WEBHOOK_TOKEN=<o token gerado>
```

⚠️ **`GEMINI_API_KEY_2` precisa ser de outro projeto Google.** A cota gratuita é por projeto: duas chaves do mesmo projeto dividem o mesmo balde de 500 chats/dia, e o "isolamento" seria só aparente — uma tarde de testes derrubaria o bot do WhatsApp.

### 2. Credenciais no n8n

Em `http://localhost:5678` → **Credentials → Add credential**:

| Credencial | Tipo | Valores |
|---|---|---|
| `PWA Webhook Token` | Header Auth | Name: `X-Webhook-Token` · Value: o `N8N_PWA_WEBHOOK_TOKEN` |
| `Gemini PWA` | Google Gemini(PaLM) API | a `GEMINI_API_KEY_2` |

As credenciais **MongoDB account** e **Redis account** já existem e são reaproveitadas — o JSON do fluxo já aponta para elas.

### 3. Importar e ativar o fluxo

**Workflows → Import from File** → [n8n/pwa-chatbot.json](../n8n/pwa-chatbot.json). Vincule as quatro credenciais, confirme que **Redis Chat Memory** está ligado ao **AI Agent**, e **ative**.

⚠️ **Prefira a tela ao CLI.** O `import:workflow` respeita o campo `active` do JSON (que vem `false`) e exige `n8n publish:workflow --id=...` mais um restart do container — e o restart derruba o WhatsApp por alguns segundos.

### 4. Subir o container

```powershell
docker compose up -d --build pwa
curl.exe -s http://localhost:8080/api/health     # {"status":"ok"}
```

O `{"status":"ok"}` já prova que o Mongo conectou e os índices foram criados.

### 5. Testar a rota isolada, sem navegador

```powershell
$TOKEN = ((Get-Content .env | Select-String '^N8N_PWA_WEBHOOK_TOKEN=') -split '=',2)[1].Trim()
curl.exe -X POST http://localhost:5678/webhook/pwa-chat `
  -H "X-Webhook-Token: $TOKEN" -H "Content-Type: application/json" `
  -d '{\"sessionId\":\"teste\",\"texto\":\"quais exames precisam de jejum?\",\"nome\":\"Teste\",\"mensagemId\":\"1\"}'
```

Espera **HTTP 200 imediato** — o webhook confirma o recebimento, não a resposta. Se vier 404, o fluxo não está ativo; se vier 403, a credencial Header Auth não bate com o `.env`.

A resposta em si chega depois, pelo retorno em `/api/n8n/resposta`. Para ver o ciclo inteiro, use o chat: mande uma pergunta e acompanhe até o balão aparecer.

---

## Como distribuir aos participantes

Três caminhos, do mais rápido ao mais indicado para uso real:

| Cenário | Endereço | Instala na tela de início? | Precisa do PC ligado? |
|---|---|---|---|
| Mesma rede Wi‑Fi | `http://<IP-do-PC>:8080` | **Não** — o navegador só registra service worker em HTTPS | sim |
| Cloudflare Tunnel | um hostname apontando para `http://pwa:8080` | sim | sim |
| **Vercel** | o domínio da Vercel | sim | **sim** — o n8n continua aqui |

Descubra o IP da máquina com:

```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq 'Dhcp' }).IPAddress
```

---

## Hospedar na Vercel

É o arranjo recomendado para levar a campo, e o mesmo que o Dashboard-PetSaúde já usa. A página fica na Vercel (HTTPS de graça, instalável, sempre no ar) e **só a chamada ao n8n volta para a sua máquina**, pelo Cloudflare Tunnel que já existe:

```
  celular ──► Vercel  (páginas + route handlers)
                 │
                 ├──► MongoDB Atlas                       (nuvem, direto)
                 │
                 └──► https://petbot.lucianomjr.dev/webhook/pwa-chat
                              │  (Cloudflare Tunnel)
                              ▼
                        n8n no seu PC ──► Gemini + Atlas
```

O túnel **já expõe** essa rota, autenticada — um POST sem o `X-Webhook-Token` devolve 403. Não há nada a configurar na Cloudflare.

### Passos

1. **Vercel → Add New → Project**, importe este repositório.
2. **Root Directory: `pwa`** — sem isso a Vercel tenta buildar a raiz e não acha um projeto Node.
3. Variáveis de ambiente do projeto:

| Variável | Valor |
|---|---|
| `MONGODB_URI` | a mesma do `.env` (com o nome do banco no caminho) |
| `PWA_MONGO_DB` | `pwa_prototipo` |
| `N8N_PWA_WEBHOOK_URL` | `https://petbot.lucianomjr.dev/webhook/pwa-chat` — **a URL do túnel, não `http://n8n:5678`** |
| `N8N_PWA_WEBHOOK_TOKEN` | o mesmo do `.env` |

4. Deploy.

> O PWA publicado tem **só o chat**. O painel de conversas mora no
> Dashboard-PetSaúde, em `/conversas`, atrás do login e do papel de admin que já
> existem lá — ver [O painel de conversas](#o-painel-de-conversas).

### O que muda em relação ao Docker

**Nada no código.** As mesmas variáveis, o mesmo Next. Três detalhes já resolvidos, mas que valem saber:

- **`output: 'standalone'` é desligado na Vercel** — ver [Armadilhas](#armadilhas).
- **O teto de 60s da Vercel deixou de importar.** Era o problema central: 35% das respostas eram geradas pelo Gemini e mortas no caminho de volta. Com o retorno assíncrono, cada requisição dura milissegundos e a espera acontece em consultas curtas.
- **O limite por IP vive no Mongo**, não em memória. Em serverless cada requisição pode cair numa instância diferente, e instância fria começa zerada: um contador em memória marcaria "1 de 40" para sempre e não seguraria a cota.

### Continua dependendo da sua máquina

A Vercel resolve a página, **não o cérebro**. Se o PC dormir, o Docker parar ou a internet cair, o túnel morre e toda mensagem vira a tela de indisponibilidade. Para um teste em campo isso significa: o PC precisa estar ligado, acordado e conectado durante toda a sessão.

Se em algum momento o protótipo precisar rodar sem depender da sua máquina, o passo é levar o n8n para um servidor — decisão de hospedagem que já está registrada em [depende-de-voce.md](depende-de-voce.md#quando-sair-do-teste).

### Conferir se o Atlas aceita a Vercel

As funções da Vercel saem de IPs variáveis. Em **Atlas → Network Access**, precisa haver `0.0.0.0/0` liberado (o dashboard já roda assim, então provavelmente está). Sem isso, o deploy sobe, a página abre, e toda requisição falha na conexão com o banco.

---

## As telas

### Chat — `/`

Mobile. **Abre direto na conversa** — não há tela de entrada nem pergunta de nome: a sessão é criada sozinha e as sessões são numeradas por ordem de chegada (`Participante 7`), o que mantém a lista da revisão legível. O aviso de consentimento aparece dentro do chat, no mesmo padrão do aviso de criptografia do WhatsApp.

Balões com rabinho, tiques de leitura, "digitando…", e a formatação do WhatsApp (`*negrito*`, `_itálico_`, `•`) renderizada como no aplicativo.

A conversa **sobrevive a recarregar a página e a fechar o navegador**: a sessão fica em `localStorage` e a transcrição é remontada do banco. Só um encerramento com avaliação começa uma sessão nova.

O que fica guardado é o par `{id, chave}`. A **chave** é gerada na criação da sessão, devolvida uma única vez e exigida em todas as rotas da conversa. Sem ela, bastava ter o id — que não é segredo, porque volta no corpo das respostas, vai para o n8n e aparece no painel de conversas — para ler a transcrição inteira, mandar mensagem em nome da pessoa, votar nas respostas dela ou encerrar a conversa com uma nota. Quem não apresenta a chave recebe **404**, e não 403: responder "existe, mas você não pode" confirmaria a existência daquela conversa. Sessões criadas antes desse campo continuam abrindo sem chave, para não apagar conversas que ainda estejam vivas no aparelho de alguém.

Sob cada resposta do bot há **👍/👎**. É o dado mais valioso da validação: diz *qual* resposta falhou, não só que a conversa foi ruim.

A avaliação final abre pelo menu (**Encerrar e avaliar**) ou sozinha, após 2 minutos parado com pelo menos 3 perguntas feitas. São três campos, todos opcionais: nota ★1–5, NPS 0–10 e um comentário.

### O painel de conversas

**Não fica mais no PWA.** Migrou para o Dashboard-PetSaúde, em **`/conversas`**, e só abre para quem tem papel `admin` — o conteúdo é relato de sintoma e pedido de atendimento escritos por cidadãos identificáveis pelo que contam, e a senha única de antes não tinha identidade nem registro de quem leu o quê.

Cartões no topo agrupados por assunto (uso, qualidade, desempenho), filtros de período, interface e situação, e a transcrição de cada conversa.

**Clique numa resposta do bot** para abrir os bastidores dela: cada pergunta da base que a busca trouxe, com o score e se passou do limiar. Cada linha leva à FAQ pelo id, para quem revisa ir da resposta ruim direto ao documento que precisa de conserto.

> Esse painel é o retorno mais direto do protótipo. O `LIMIAR_SCORE = 0.82` do fluxo foi estimado a partir de **cinco consultas manuais** ([whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json), nó *Montar contexto*). Olhar os scores numa resposta marcada com 👎 mostra se o corte está alto demais (o trecho certo ficou de fora por pouco) ou baixo demais (entrou ruído que confundiu o agente).

Exportação em **CSV** (uma linha por mensagem, abre no Excel) e **JSON** (sessões com a transcrição aninhada).

### O que o protótipo alimenta no dashboard

O registro das conversas não é descartável como o protótipo: é dele que sai a melhoria da base.

- **Contador de perguntas sem resposta**, no topo de `/conversas`. "Não encontrou" era um número entre os indicadores, e número não pede nada a ninguém — agora leva a uma fila.
- **`/curadoria`** junta até 10 dessas perguntas e manda **um** prompt ao Gemini, pedindo que agrupe as que pedem a mesma coisa e proponha a FAQ. As FAQs vizinhas não são buscadas de novo: já estão em `trechosDebug` da própria resposta, com os scores daquele momento — a rodada não gasta embedding nenhum.
- O modelo **não escreve orientação de saúde**. A resposta sai vazia quando as FAQs fornecidas não continham a informação; aprovar exige que alguém escreva o texto, e a FAQ é criada pelo mesmo caminho do formulário manual, com quem aprovou como autor.
- Toda rodada fica registrada com as perguntas que entraram e a resposta crua do modelo, visível em "Histórico das análises".

> Do primeiro lote real: 17 lacunas, das quais **3 não eram lacuna nenhuma** ("qual o melhor time de futebol do brasil?", "Hoje fiz muita coisa") — o chatbot acertou em não responder, e elas são encerradas sem virar sugestão. Das outras, duas eram a mesma pergunta ("ata e como chego la" e "como chego la ?") e foram agrupadas.

---

## Roteiro de teste com participante

O mesmo do [chatbot.md](chatbot.md#passo-7--testar-de-ponta-a-ponta), que já cobre os modos de falha conhecidos:

1. Uma saudação (`oi`).
2. Uma pergunta com resposta na base.
3. Uma pergunta fora de escopo — **tem que admitir que não sabe**, não inventar.
4. Três perguntas seguidas sobre assuntos diferentes — as três respostas precisam ser diferentes entre si (o teste do "bot viciado" de [proposta-rag.md](proposta-rag.md)).

---

## Levar para um posto de saúde

O consumo não é o problema: a stack inteira usa ~900 MB de RAM e fica perto de 0% de CPU parada. Qualquer notebook aguenta.

O problema é **dependência de internet**: o Gemini e o MongoDB Atlas são serviços de nuvem. Sem rede, não existe modo offline — o protótipo mostra a mensagem de indisponibilidade e nada mais.

Antes de sair:

- [ ] **Um celular com 4G como reserva**, para compartilhar conexão se o Wi‑Fi do posto falhar
- [ ] **Impedir o PC de dormir** — `powercfg /change standby-timeout-ac 0` (a tela pode apagar; suspender derruba tudo)
- [ ] **Conferir a cota do dia**: cada mensagem gasta 1 chat + 1 embedding. No plano gratuito são 500 conversas/dia, ou seja **~50 participantes com 10 perguntas cada**
- [ ] **Liberar recursos**: `COMPOSE_PROFILES=` no `.env` deixa o dashboard fora e economiza ~120 MB
- [ ] **Testar o link no próprio celular antes de sair de casa**, pela mesma via que os participantes vão usar
- [ ] Deixar o Dashboard-PetSaúde aberto em `/conversas` noutra janela, para acompanhar as sessões chegando

---

## Ao fim da validação

Apagar as conversas é um comando só, e não tem como levar FAQ junto — o banco é exclusivo do protótipo:

```powershell
cd pwa
node -e "const {MongoClient}=require('mongodb');(async()=>{const c=new MongoClient(process.env.MONGODB_URI);await c.connect();await c.db(process.env.PWA_MONGO_DB||'pwa_prototipo').dropDatabase();console.log('base do prototipo apagada');await c.close();})()"
```

**Exporte o CSV antes.** O `dropDatabase` não pergunta duas vezes.

---

## Quando o bot responde "Não consegui responder agora"

Esse é o texto de indisponibilidade — quer dizer que a chamada ao n8n falhou. A partir da versão atual, o **motivo fica gravado** e aparece na tela de revisão, junto da resposta que falhou. Os casos, e como distingui-los pelo tempo:

| Latência | Provável causa |
|---|---|
| **0 ms** | `N8N_PWA_WEBHOOK_URL` ou `N8N_PWA_WEBHOOK_TOKEN` não definidos no ambiente |
| **< 1 s** | DNS ou rota: a URL aponta para `http://n8n:5678` fora da rede do compose (o nome não existe na Vercel), ou o fluxo não está publicado (404) |
| **1–3 s** | Token errado — o n8n devolve 403. `N8N_PWA_WEBHOOK_TOKEN` e a credencial `PWA Webhook Token` são independentes, e mudar só um quebra tudo |
| **45 s** | Tempo limite: o Gemini está lento ou sem cota, ou o PC que hospeda o n8n caiu |

Teste a rota isolada com o comando do [Passo 5](#5-testar-a-rota-isolada-sem-navegador) — se ela responder e o PWA não, o problema está na configuração do PWA, não no fluxo.

Na Vercel, o motivo também sai nos logs da função (**Deployments → Functions**).

---

## Armadilhas

**Instalar como aplicativo exige HTTPS.** Por IP da rede local o chat funciona normalmente, mas o navegador recusa registrar o service worker e o "Adicionar à tela de início" não aparece. Não é defeito do protótipo.

**`output: 'standalone'` derruba o build na Vercel.** Ele é obrigatório para a imagem Docker não passar de 1 GB, e proibido na Vercel: o build de lá termina com um passo próprio que procura os arquivos de rastreio no formato padrão, que o modo standalone não produz. O erro é

```
ENOENT: no such file or directory, open '.next/next-server.js.nft.json'
```

— que não menciona `output` nem `standalone`, e leva a procurar o problema no lugar errado. O [next.config.ts](../pwa/next.config.ts) resolve com `process.env.VERCEL ? undefined : 'standalone'`. Mesma família da armadilha do `NITRO_PRESET` no front do dashboard ([chatbot.md](chatbot.md#armadilhas-já-descobertas)): o alvo do build precisa diferir entre o Docker e a plataforma.

**`HOSTNAME=0.0.0.0` no Dockerfile não é decorativo.** O servidor gerado pelo `output: standalone` do Next escuta só em `localhost` *dentro* do container; sem essa variável, a porta publicada responde *connection refused* e o container parece saudável.

**Um `data:` URI de SVG não enxerga as variáveis CSS da página.** O padrão de fundo do chat é renderizado em contexto isolado — por isso a cor do traço está fixa dentro do SVG e o tema escuro troca a imagem inteira. Usar `var(--x)` ali dentro faz o fundo sumir, sem erro nenhum no console.

**O limite de 40 mensagens por IP a cada 10 minutos é proposital.** Com o acesso aberto, uma aba deixada segurando F5 queimaria a cota do dia. Se um teste presencial legítimo esbarrar nele (muitos celulares atrás do mesmo NAT), o valor está em `pwa/src/lib/limite.ts`.

**Trocar o `N8N_PWA_WEBHOOK_TOKEN` exige mexer em dois lugares** — o `.env` (que alimenta o container) e a credencial `PWA Webhook Token` do n8n, que é independente. Mudar só um faz toda mensagem cair na indisponibilidade. Depois: `docker compose up -d pwa` (recriar, não reiniciar — a variável é injetada na criação).

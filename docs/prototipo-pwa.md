# Protótipo PWA de validação

Interface web com cara de WhatsApp, que roda **o mesmo fluxo de RAG** do canal em produção, pede uma nota ao final e registra tudo para análise.

Existe por um motivo prático: validar a **qualidade das respostas** com usuários reais. Pelo WhatsApp isso é ruim de fazer: exige parear um número, ninguém consegue observar a interação, e as conversas não são guardadas (decisão deliberada, ver [privacidade-e-lgpd.md](privacidade-e-lgpd.md)).

> ⚠️ **Aqui as conversas SÃO gravadas.** É o objetivo do protótipo, e por isso a conversa só começa depois do aceite, que pede para não informar dado pessoal. Ao fim da validação, [apague a base](#ao-fim-da-validação).

---

## Em uso e em validação

Esta seção é o estado do projeto, e muda com ele. As regras de trabalho ([CLAUDE.md](../CLAUDE.md)) apontam para cá em vez de repetir o estado.

| Parte | Situação | Onde a novidade entra antes |
|---|---|---|
| Chat anônimo, `/` | em uso por participantes da validação: não muda de comportamento | `/staging` |
| Contas e avisos push, `/staging` | em validação com a equipe | variável própria, desligada por padrão (como `GATILHOS_ATIVOS`) |
| Painel da equipe | ferramenta de trabalho diária | selo `emTeste: true` no menu |
| Canal do WhatsApp | pausado: só o PWA fica no ar, e o gateway pode ficar parado sem o QR lido | nenhum |

Quando uma parte muda de situação (o `/staging` é promovido para o `/`, o WhatsApp volta), a linha dela muda no mesmo commit.

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
     │              │   n8n · /webhook/pwa-chat     │
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

# opcionais
PWA_RETENCAO_DIAS=180
PWA_CONTATO_PRIVACIDADE=<e-mail ou telefone para pedidos sobre os dados>
```

⚠️ **`GEMINI_API_KEY_2` precisa ser de outro projeto Google.** A cota gratuita é por projeto: duas chaves do mesmo projeto dividem o mesmo balde de 500 chats/dia, e o "isolamento" seria só aparente: uma tarde de testes derrubaria o bot do WhatsApp.

### 2. Credenciais no n8n

Em `http://localhost:5678` → **Credentials → Add credential**:

| Credencial | Tipo | Valores |
|---|---|---|
| `PWA Webhook Token` | Header Auth | Name: `X-Webhook-Token` · Value: o `N8N_PWA_WEBHOOK_TOKEN` |
| `Gemini PWA` | Google Gemini(PaLM) API | a `GEMINI_API_KEY_2` |

As credenciais **MongoDB account** e **Redis account** já existem e são reaproveitadas: o JSON do fluxo já aponta para elas.

### 3. Importar e ativar o fluxo

**Workflows → Import from File** → [n8n/pwa-chatbot.json](../n8n/pwa-chatbot.json). Vincule as quatro credenciais, confirme que **Redis Chat Memory** está ligado ao **AI Agent**, e **ative**.

⚠️ **Prefira a tela ao CLI.** O `import:workflow` respeita o campo `active` do JSON (que vem `false`) e exige `n8n publish:workflow --id=...` mais um restart do container, e o restart derruba o WhatsApp por alguns segundos.

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

Espera **HTTP 200 imediato**: o webhook confirma o recebimento, não a resposta. Se vier 404, o fluxo não está ativo; se vier 403, a credencial Header Auth não bate com o `.env`.

A resposta em si chega depois, pelo retorno em `/api/n8n/resposta`. Para ver o ciclo inteiro, use o chat: mande uma pergunta e acompanhe até o balão aparecer.

---

## Como distribuir aos participantes

Três caminhos, do mais rápido ao mais indicado para uso real:

| Cenário | Endereço | Instala na tela de início? | Precisa do PC ligado? |
|---|---|---|---|
| Mesma rede Wi‑Fi | `http://<IP-do-PC>:8080` | **Não**: o navegador só registra service worker em HTTPS | sim |
| Cloudflare Tunnel | um hostname apontando para `http://pwa:8080` | sim | sim |
| **Vercel** | o domínio da Vercel | sim | **sim**: o n8n continua aqui |

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

O túnel **já expõe** essa rota, autenticada: um POST sem o `X-Webhook-Token` devolve 403. Não há nada a configurar na Cloudflare.

### Passos

1. **Vercel → Add New → Project**, importe este repositório.
2. **Root Directory: `pwa`**: sem isso a Vercel tenta buildar a raiz e não acha um projeto Node.
3. Variáveis de ambiente do projeto:

| Variável | Valor |
|---|---|
| `MONGODB_URI` | a mesma do `.env` (com o nome do banco no caminho) |
| `PWA_MONGO_DB` | `pwa_prototipo` |
| `N8N_PWA_WEBHOOK_URL` | `https://petbot.lucianomjr.dev/webhook/pwa-chat`: **a URL do túnel, não `http://n8n:5678`** |
| `N8N_PWA_WEBHOOK_TOKEN` | o mesmo do `.env` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | opcionais, só para o login com Google no `/staging` ([contas-de-usuario.md](contas-de-usuario.md#criar-a-credencial)) |

4. Deploy.

> O PWA publicado tem **só o chat**. O painel de conversas mora no
> Dashboard-PetSaúde, em `/conversas`, atrás do login e do papel de admin que já
> existem lá: ver [O painel de conversas](#o-painel-de-conversas).

### O que muda em relação ao Docker

**Nada no código.** As mesmas variáveis, o mesmo Next. Três detalhes já resolvidos, mas que valem saber:

- **`output: 'standalone'` é desligado na Vercel**: ver [armadilhas.md](armadilhas.md#protótipo-pwa).
- **O teto de 60s da Vercel deixou de importar.** Era o problema central: 35% das respostas eram geradas pelo Gemini e mortas no caminho de volta. Com o retorno assíncrono, cada requisição dura milissegundos e a espera acontece em consultas curtas.
- **O limite por IP vive no Mongo**, não em memória. Em serverless cada requisição pode cair numa instância diferente, e instância fria começa zerada: um contador em memória marcaria "1 de 40" para sempre e não seguraria a cota.
- **Os avisos push não saem da Vercel.** O relógio que os envia só roda no servidor do Docker. Como os dois usam o mesmo banco e as mesmas chaves, quem ativa os avisos pela Vercel recebe o que o container do PC enviar, desde que ele esteja no ar. Ver [notificacoes-push.md](notificacoes-push.md#o-relógio).

### Continua dependendo da sua máquina

A Vercel resolve a página, **não o cérebro**. Se o PC dormir, o Docker parar ou a internet cair, o túnel morre e toda mensagem vira a tela de indisponibilidade. Para um teste em campo isso significa: o PC precisa estar ligado, acordado e conectado durante toda a sessão.

Se em algum momento o protótipo precisar rodar sem depender da sua máquina, o passo é levar o n8n para um servidor: decisão de hospedagem que já está registrada em [caminho-para-producao.md](caminho-para-producao.md).

### Conferir se o Atlas aceita a Vercel

As funções da Vercel saem de IPs variáveis. Em **Atlas → Network Access**, precisa haver `0.0.0.0/0` liberado (o dashboard já roda assim, então provavelmente está). Sem isso, o deploy sobe, a página abre, e toda requisição falha na conexão com o banco.

---

## As telas

### Chat: `/`

Mobile. **Abre direto na conversa**: não há tela de entrada nem pergunta de nome: a sessão é criada sozinha e as sessões são numeradas por ordem de chegada (`Participante 7`), o que mantém a lista da revisão legível. O aviso de consentimento aparece dentro do chat, no mesmo padrão do aviso de criptografia do WhatsApp.

Balões com rabinho, tiques de leitura, "digitando…", e a formatação do WhatsApp (`*negrito*`, `_itálico_`, `•`) renderizada como no aplicativo.

A conversa **sobrevive a recarregar a página e a fechar o navegador**: a sessão fica em `localStorage` e a transcrição é remontada do banco. Só um encerramento com avaliação começa uma sessão nova.

O que fica guardado é o par `{id, chave}`. A **chave** é gerada na criação da sessão, devolvida uma única vez e exigida em todas as rotas da conversa. Sem ela, bastava ter o id (que não é segredo, porque volta no corpo das respostas, vai para o n8n e aparece no painel de conversas) para ler a transcrição inteira, mandar mensagem em nome da pessoa, votar nas respostas dela ou encerrar a conversa com uma nota. Quem não apresenta a chave recebe **404**, e não 403: responder "existe, mas você não pode" confirmaria a existência daquela conversa. Sessões criadas antes desse campo continuam abrindo sem chave, para não apagar conversas que ainda estejam vivas no aparelho de alguém.

Sob cada resposta do bot há **👍/👎**. É o dado mais valioso da validação: diz *qual* resposta falhou, não só que a conversa foi ruim.

A avaliação final abre pelo menu (**Encerrar e avaliar**) ou sozinha, após 2 minutos parado com pelo menos 3 perguntas feitas. São três campos, todos opcionais: nota ★1–5, NPS 0–10 e um comentário.

Antes da primeira pergunta o bot pede o **aceite**, com dois botões, e o campo só libera depois de *Aceitar*; a data do aceite ou da recusa fica gravada na sessão. Não há saudação nem atalhos de assunto: aceitou, o chat está pronto para a pergunta, e o que o assistente entende, entende do texto.

O **menu ⋮** tem quatro itens:

- **Acessibilidade**: tamanho do texto em quatro degraus, com uma amostra que mostra o efeito na hora, e tema claro, escuro ou automático. Existe porque o chat mede tudo em px para imitar o WhatsApp e por isso ignora a fonte do sistema, e no posto muita gente usa o celular com a fonte no máximo.
- **Privacidade**: a página `/privacidade`, que também tem link no aviso do topo da conversa.
- **Encerrar e avaliar**: abre a avaliação.
- **Apagar minha conversa**: depois de confirmar, apaga a conversa e as cópias das perguntas guardadas pela curadoria. Some quando a conversa já foi encerrada, porque a chave sai do aparelho ao avaliar; nesse caso a equipe apaga pela transcrição no dashboard.

O **clipe e o microfone** simulam a experiência do WhatsApp, mas nada sai do aparelho: o bot responde que só lê texto, e fica registrado só que houve a tentativa, com tipo, tamanho e duração. O nome do arquivo não é guardado. Servem para medir quanta gente tenta mandar foto do exame ou áudio em vez de digitar.

Dá para conversar só pelo **teclado ou com leitor de tela**: o foco fica preso nos diálogos e o Esc fecha, um atalho pula direto para o campo de mensagem, e a espera ("digitando…") e os tiques de entrega são anunciados em palavras.

As conversas **se apagam sozinhas** depois de `PWA_RETENCAO_DIAS` (180 por padrão), por um índice TTL que o próprio PWA cria ao conectar no banco. Mudar o prazo depois é seguro: o índice existente é ajustado, não recriado.

### Contas e avisos: `/staging`

Uma rota de validação no **mesmo app e nos mesmos bancos**, sem link a partir do `/` e com uma faixa dizendo que é ambiente de testes. Nela o chat é o mesmo, mas ligado a uma **conta** (e-mail e senha, ou Google quando houver credencial), com histórico em qualquer aparelho e **avisos push** que a equipe envia pelo dashboard.

O `/` não muda em nada: continua anônimo, com o mesmo service worker e o mesmo manifest. Tudo do staging mora em `pwa/src/app/staging/`, e levá-lo para o `/` depois é mover a pasta.

Como funciona cada parte, e como medir se o push chega em cada tipo de celular: [contas-de-usuario.md](contas-de-usuario.md) e [notificacoes-push.md](notificacoes-push.md).

### O painel de conversas

**Não fica mais no PWA.** Migrou para o Dashboard-PetSaúde, em **`/conversas`**, e só abre para quem tem papel `admin`: o conteúdo é relato de sintoma e pedido de atendimento escritos por cidadãos identificáveis pelo que contam, e a senha única de antes não tinha identidade nem registro de quem leu o quê.

Cartões no topo agrupados por assunto (uso, qualidade, desempenho), filtros de período, interface e situação, e a transcrição de cada conversa.

**Clique numa resposta do bot** para abrir os bastidores dela: cada pergunta da base que a busca trouxe, com o score e se passou do limiar. Cada linha leva à FAQ pelo id, para quem revisa ir da resposta ruim direto ao documento que precisa de conserto.

> Esse painel é o retorno mais direto do protótipo, e foi com ele que o `LIMIAR_SCORE = 0.82` deixou de ser a estimativa de cinco consultas manuais. Com 81 perguntas de participantes, baixar o corte para 0,80 ganharia 2 respostas corretas e deixaria entrar 8 contextos irrelevantes a mais, então o valor ficou. A conclusão está no nó *Montar contexto* dos dois fluxos: pergunta sem resposta aqui é **falta de conteúdo na base**, não corte apertado, e é isso que a curadoria resolve.

Exportação em **CSV**, uma linha por mensagem, que abre no Excel.

Na transcrição, **Apagar a pedido da pessoa** atende um pedido de exclusão que chegou à equipe por fora do chat: de quem trocou de celular ou limpou o navegador. Fica no histórico quem apagou e quando, sem nenhum conteúdo.

### O que o protótipo alimenta no dashboard

O registro das conversas não é descartável como o protótipo: é dele que sai a melhoria da base.

- **Contador de perguntas sem resposta**, no topo de `/conversas`. "Não encontrou" era um número entre os indicadores, e número não pede nada a ninguém. Agora leva a uma fila.
- **`/curadoria`** junta até 10 dessas perguntas e manda **um** prompt ao Gemini, pedindo que agrupe as que pedem a mesma coisa e proponha a FAQ. As FAQs vizinhas não são buscadas de novo: já estão em `trechosDebug` da própria resposta, com os scores daquele momento, e a rodada não gasta embedding nenhum.
- O modelo **não escreve orientação de saúde**. A resposta sai vazia quando as FAQs fornecidas não continham a informação; aprovar exige que alguém escreva o texto, e a FAQ é criada pelo mesmo caminho do formulário manual, com quem aprovou como autor.
- Toda rodada fica registrada com as perguntas que entraram e a resposta crua do modelo, visível em "Histórico das análises".

> Do primeiro lote real: 17 lacunas, das quais **3 não eram lacuna nenhuma** ("qual o melhor time de futebol do brasil?", "Hoje fiz muita coisa"): o chatbot acertou em não responder, e elas são encerradas sem virar sugestão. Das outras, duas eram a mesma pergunta ("ata e como chego la" e "como chego la ?") e foram agrupadas.

---

## Roteiro de teste com participante

O mesmo do [instalacao.md](instalacao.md#8-testar-de-ponta-a-ponta), que já cobre os modos de falha conhecidos:

1. Uma saudação (`oi`).
2. Uma pergunta com resposta na base.
3. Uma pergunta fora de escopo: **tem que admitir que não sabe**, não inventar.
4. Três perguntas seguidas sobre assuntos diferentes: as três respostas precisam ser diferentes entre si (o teste do "bot viciado" de [arquitetura.md](arquitetura.md#por-que-a-busca-é-obrigatória)).

---

## Levar para um posto de saúde

O consumo não é o problema: a stack inteira usa ~900 MB de RAM e fica perto de 0% de CPU parada. Qualquer notebook aguenta.

O problema é **dependência de internet**: o Gemini e o MongoDB Atlas são serviços de nuvem. Sem rede, não existe modo offline, e o protótipo mostra a mensagem de indisponibilidade e nada mais.

Antes de sair:

- [ ] **Um celular com 4G como reserva**, para compartilhar conexão se o Wi‑Fi do posto falhar
- [ ] **Impedir o PC de dormir**: `powercfg /change standby-timeout-ac 0` (a tela pode apagar; suspender derruba tudo)
- [ ] **Conferir a cota do dia**: cada mensagem gasta 1 chat + 1 embedding. No plano gratuito são 500 conversas/dia, ou seja **~50 participantes com 10 perguntas cada**
- [ ] **Liberar recursos**: `COMPOSE_PROFILES=` no `.env` deixa o dashboard fora e economiza ~120 MB
- [ ] **Testar o link no próprio celular antes de sair de casa**, pela mesma via que os participantes vão usar
- [ ] Deixar o Dashboard-PetSaúde aberto em `/conversas` noutra janela, para acompanhar as sessões chegando

---

## Ao fim da validação

Apagar as conversas é um comando só, e não tem como levar FAQ junto, porque o banco é exclusivo do protótipo:

```powershell
cd pwa
node -e "const {MongoClient}=require('mongodb');(async()=>{const c=new MongoClient(process.env.MONGODB_URI);await c.connect();await c.db(process.env.PWA_MONGO_DB||'pwa_prototipo').dropDatabase();console.log('base do prototipo apagada');await c.close();})()"
```

**Exporte o CSV antes.** O `dropDatabase` não pergunta duas vezes.

O banco do protótipo guarda também o que é do `/staging`: as **contas**, os aparelhos inscritos, os avisos e as **chaves VAPID** (em `configuracoes`). Apagá-lo apaga as contas, e as chaves novas geradas depois fazem todo aparelho precisar ativar os avisos de novo. Para apagar só as conversas anônimas, filtre `sessoes` e `mensagens` sem `usuarioId` em vez de derrubar o banco.

Ele não alcança as **cópias das perguntas** que a curadoria guardou em `ministerio_saude` (`sugestoes_faq` e `curadoria_rodadas`). É de propósito: a sugestão é material da base de conteúdo e precisa sobreviver ao protótipo. Apagar também essas cópias é outra operação, sobre outro banco.

---

## Quando o bot responde com uma mensagem de falha

São três mensagens, e cada uma aponta um lugar diferente para procurar. O motivo técnico fica gravado na própria mensagem e aparece na transcrição da conversa, em `/conversas` no dashboard ("falhou: …").

| O que a pessoa vê | O que aconteceu | Onde olhar |
|---|---|---|
| **"O assistente está temporariamente fora do ar"** | A pergunta nem chegou ao fluxo: `N8N_PWA_WEBHOOK_URL` ou `N8N_PWA_WEBHOOK_TOKEN` ausentes, n8n desligado ou inalcançável, fluxo não publicado (404), token errado (401/403) ou túnel sem destino (502/503) | O motivo gravado na mensagem. `N8N_PWA_WEBHOOK_TOKEN` e a credencial `PWA Webhook Token` do n8n são independentes, e mudar só um quebra tudo. Na Vercel, `http://n8n:5678` não existe: esse nome só vale dentro do compose |
| **"Não consegui responder agora"** | O fluxo recebeu a pergunta, mas o agente falhou e devolveu a resposta de indisponibilidade (por exemplo, fim da cota gratuita do Gemini ou erro do modelo) | As execuções do n8n, no nó que falhou |
| **"Demorei demais para responder desta vez"** | O fluxo aceitou a pergunta e a resposta não voltou em 4 minutos, ou a entrega bateu no tempo limite do túnel (408, 504, 524) | As execuções do n8n. Se a execução terminou bem e a resposta não chegou, o problema é o retorno: `PWA_PUBLIC_URL` precisa ser um endereço que o **container do n8n** alcance. No Docker, `http://pwa:8080` |

Teste a rota isolada com o comando do [Passo 5](#5-testar-a-rota-isolada-sem-navegador): se ela responder e o PWA não, o problema está na configuração do PWA, não no fluxo.

Na Vercel, o motivo também sai nos logs da função (**Deployments → Functions**).

---

## Armadilhas

As deste protótipo estão com as demais, em [armadilhas.md](armadilhas.md#protótipo-pwa): build na Vercel, `HOSTNAME` no Dockerfile, o SVG de fundo, o limite por IP e a troca do token do webhook.

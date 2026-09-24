# Arquitetura

Chatbot de saúde que recebe mensagens do WhatsApp, consulta uma base de FAQs vetorial e responde com o Gemini. Projeto do **PET-SAÚDE** (Programa de Educação pelo Trabalho para a Saúde, do Ministério da Saúde): o domínio é saúde humana e serviços públicos de saúde.

Este documento explica **como o sistema funciona e por que é assim**. Para subir do zero, ver [instalacao.md](instalacao.md).

---

## As peças

- **`whatsapp-gateway`** (NestJS, [backend/](../backend/)), dono do canal: conexão, sessão, deduplicação, política anti-ban e formatação. Substituiu o WAHA.
- **n8n**: dono da inteligência: agente Gemini, busca vetorial e memória da conversa.
- **Dashboard-PetSaúde**: painel de gestão das FAQs, em [repositório próprio](https://github.com/LucMazarJR/Dashboard-PetSaude), clonado dentro desta pasta. Escreve na mesma base que o chatbot lê.
- **PWA** ([pwa/](../pwa/)), protótipo de validação: o mesmo RAG numa interface web, com as conversas gravadas para análise. Ver [prototipo-pwa.md](prototipo-pwa.md).

```
                    ┌──────────────────────────────┐
  Cidadão           │      whatsapp-gateway        │
    │               │                              │
    │  mensagem     │  Baileys → normaliza →       │
    ├──────────────►│  dedupe → envelope canônico  │
    │               │              │               │
    │               └──────────────┼───────────────┘
    │                              │ POST + X-Webhook-Token
    │                              ▼
    │               ┌──────────────────────────────┐
    │               │            n8n               │
    │               │  If → Dados → Switch →       │
    │               │  Buscar FAQs → Montar        │
    │               │  contexto → AI Agent         │
    │               │    ├─ MongoDB Vector Store   │
    │               │    └─ Redis Chat Memory      │
    │               └──────────────┬───────────────┘
    │                              │ POST /api/v1/messages + X-Api-Key
    │                              ▼
    │   resposta    ┌──────────────────────────────┐
    │◄──────────────┤  formata → fila anti-ban →   │
                    │  "digitando..." → envia      │
                    └──────────────────────────────┘

Dashboard-PetSaude (repositório separado)
   front (TanStack Start) ──> back (NestJS) ──> MongoDB Atlas  (mesma base de FAQs)
                                            └──> PostgreSQL     (usuários, papéis, sessões)
```

### Serviços

| Serviço | Imagem / origem | Porta | Função |
|---|---|---|---|
| whatsapp-gateway | build de `./backend` | 3000 | Conexão com o WhatsApp, envio e recebimento |
| n8n | `n8nio/n8n` | 5678 | Orquestra o fluxo de resposta |
| redis | `redis:7-alpine` | interna | Deduplicação (db 1) e memória de conversa do n8n (db 0) |
| cloudflared | `cloudflare/cloudflared` | nenhuma | Expõe o webhook do n8n para a internet |
| postgres | `postgres:17-alpine` | configurável | Identidade do dashboard: usuários, papéis, sessões. **Não guarda FAQ** |
| pwa | build de `./pwa` | 8080 | Protótipo de validação |
| dashboard-api / dashboard-front | build de `./Dashboard-PetSaude` | 3333 / 5173 | Opcionais, atrás do profile `dashboard` |

Volumes: `wa_sessions` (credenciais do WhatsApp; apagar exige QR novo), `n8n_data` (fluxos e credenciais), `redis_data`, `postgres_data`.

> O gateway usa o **db 1** do Redis e o n8n o **db 0**, de propósito: assim a deduplicação e a memória de conversa não colidem.

---

## O gateway, e por que ele existe

O WAHA era caixa-preta: não dava para deduplicar, controlar o ritmo de envio, repetir com segurança nem auditar nada, e o fluxo do n8n precisava cavar dentro de `payload._data.key.remoteJidAlt`, campo interno do Baileys, para saber quem falou. Trocar o motor quebrava o bot.

O gateway isola o Baileys atrás da porta `WhatsAppProvider` e entrega ao n8n um envelope estável. O que ele acrescenta:

| Recurso | Por quê |
|---|---|
| **Deduplicação** por id de mensagem (Redis, 24h) | O WhatsApp reentrega mensagens quando a conexão oscila. Sem isso o cidadão recebe a mesma resposta 2–3 vezes, e cada repetição custa uma chamada ao Gemini |
| **Fila anti-ban** | Serializa envios, atraso aleatório de 1,2–3s, teto de 20 msg/min e "digitando" simulado. Responder instantaneamente e em rajada é o padrão mais óbvio de automação |
| **Idempotência de envio** | O nó HTTP do n8n repete em timeout; sem isso a resposta chegaria duplicada |
| **Formatação para WhatsApp** | Converte HTML/Markdown residual do modelo para `*negrito*` e `_itálico_` |
| **Reconexão automática** | Backoff exponencial, distinguindo queda temporária de sessão desvinculada |
| **Autenticação nos dois sentidos** | `X-Api-Key` na entrada, `X-Webhook-Token` + assinatura HMAC na saída |
| **Verificação do destinatário** | Número solto passa por `onWhatsApp()` antes do envio; sem conta, devolve 400 em vez de sumir em silêncio |
| **Logs sanitizados** | JSON com `correlationId` ligando mensagem recebida e resposta enviada. O conteúdo **nunca** é registrado: é dado de saúde. Falha de entrega loga mensagem, código, status e URL, nunca os headers com o token |

A arquitetura interna (hexagonal, ports & adapters) está em [backend/README.md](../backend/README.md).

### Contrato: gateway → n8n

```http
POST http://n8n:5678/webhook/whatsapp
X-Webhook-Token: <N8N_WEBHOOK_TOKEN>
X-Signature-256: sha256=<HMAC do corpo>
X-Correlation-Id: <uuid>
```

```json
{
  "eventId": "e7c3...",
  "type": "message.received",
  "occurredAt": "2026-08-04T13:22:31.412Z",
  "sessionId": "default",
  "message": {
    "id": "3EB0C767D26B8F3A1",
    "chatId": "5516999998888@s.whatsapp.net",
    "from": { "phoneE164": "+5516999998888", "pushName": "Maria" },
    "type": "text",
    "text": "quais exames precisam de jejum?",
    "quotedMessageId": null,
    "isGroup": false,
    "timestamp": "2026-08-04T13:22:30.000Z"
  }
}
```

Mensagem não-texto chega com `"type": "audio" | "image" | …` e `"text": null`, e quem decide a resposta continua sendo o n8n. Eventos de sessão usam `"type": "session.status"`, com `status` e `phoneE164` no lugar de `message`.

> `phoneE164` e `pushName` costumam vir `null`: o WhatsApp migrou para endereçamento LID (`…@lid`) e o número real não é mais entregue no evento. Não quebra nada: o fluxo responde pelo `chatId`, e enviar de volta para um `@lid` funciona.

### Contrato: n8n → gateway

```http
POST http://whatsapp-gateway:3000/api/v1/messages
X-Api-Key: <GATEWAY_API_KEY>
```

```json
{
  "sessionId": "default",
  "to": "5516999998888@s.whatsapp.net",
  "type": "text",
  "text": "Para o exame de zinco: *jejum* de 8 horas.",
  "idempotencyKey": "e7c3..."
}
```

Resposta `202`, com o id real da mensagem. A requisição só retorna depois da entrega ao WhatsApp: como passa pela fila anti-ban, leva alguns segundos. É proposital: o n8n recebe o id real e o erro real. Referência completa em `http://localhost:3000/api/docs` (Swagger).

---

## O fluxo no n8n

[n8n/whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json), rota `/webhook/whatsapp`.

```
Webhook → If → Dados → Switch → Buscar FAQs → Montar contexto → AI Agent → Enviar resposta
                                  (mode: load)     (Code)           ↘ erro → aviso de indisponibilidade
                                                          ↘ não-texto → aviso de somente texto
```

| Nó | Configuração |
|---|---|
| **Webhook** | `/webhook/whatsapp`, autenticado por Header Auth |
| **If** | Só segue com `body.type == "message.received"` |
| **Dados** | Normaliza para `IdChat`, `TextoMensagem`, `NomeUser`, `IdMsg`, `TipoMensagem`, `EventId`, `SessionId`, `CorrelationId` |
| **Switch** | `TipoMensagem == "text"` segue para a busca; o resto vai para o aviso de somente texto, sem chegar ao agente |
| **Buscar FAQs** | Vector Store em `mode: load`, `topK: 10`, `preFilter: {"isActive": true}` |
| **Montar contexto** | Nó Code: agrega os documentos num item só, descarta trechos com `score < 0.82` e reanexa os campos que o Vector Store derruba |
| **AI Agent** | `gemini-3.1-flash-lite` (cota gratuita de 500 por dia), com 3 tentativas contra sobrecarga e `gemini-2.5-flash-lite` de reserva quando as três falham. No fluxo do PWA, se as duas falharem, um segundo agente tenta o `gemini-3.5-flash-lite` antes da mensagem de indisponibilidade |
| **Redis Chat Memory** | db 0, janela de **4 mensagens** (2 turnos), TTL de 1h |
| **Embeddings Google Gemini** | `gemini-embedding-2`, que precisa ser **o mesmo modelo da base**. Ver [base-de-faqs.md](base-de-faqs.md#a-regra-que-quebra-tudo-em-silêncio) |
| **Enviar \*** | `POST /api/v1/messages` no gateway, com `idempotencyKey = EventId` |

Existe um segundo fluxo, [n8n/pwa-chatbot.json](../n8n/pwa-chatbot.json), cópia deste com outra rota, outro token e outra credencial do Gemini. Ele não interfere no canal: ver [prototipo-pwa.md](prototipo-pwa.md).

### Por que a busca é obrigatória

Numa versão anterior o vector store era uma **ferramenta** do agente (`retrieve-as-tool`): quem decidia buscar era o modelo. Com um modelo pequeno, tool-calling é irregular, quando ele não chamava a ferramenta, respondia por conhecimento próprio ou dizia que não encontrou. O system prompt pedia "sempre busque primeiro", mas isso é **garantia por pedido, não por estrutura**.

Hoje a busca acontece sempre, e o resultado chega pronto no prompt. O agente deixou de ser um agente com ferramentas e virou o que precisa ser aqui: um **redator** que recebe pergunta + trechos e escreve a resposta.

O ganho decisivo não foi de qualidade, e sim de **observabilidade**. Quando a busca volta vazia num fluxo com ferramenta, o agente responde por conhecimento próprio e o texto sai plausível: houve um período em que isso foi lido como "o RAG está funcionando". No fluxo determinístico, `QtdTrechos: 0` denuncia na hora.

O custo é real e precisa ser lembrado: **toda mensagem gasta um embedding**, mesmo "oi". Antes só gastava quando o agente decidia buscar.

### Por que existe um nó Code no meio

Três coisas quebram o fluxo se o nó não estiver lá:

- **Fan-out.** O vector store em `mode: load` emite **um item por documento**. Sem agregar, o agente rodaria dez vezes e o cidadão receberia dez mensagens. O Code roda em *Run Once for All Items* e devolve um item só.
- **Perda de campos.** A saída do vector store substitui o formato do item e derruba `IdChat`, `EventId`, `SessionId` e `CorrelationId`, que os nós de envio e o `sessionKey` da memória precisam. O Code relê do nó `Dados` e reanexa.
- **Busca vazia.** Um nó que emite zero itens **não aciona os seguintes**, e o cidadão ficaria sem resposta nenhuma. Por isso `Buscar FAQs` está com `alwaysOutputData: true`: emite um item vazio, o Code marca `TemContexto: false`, e o agente ainda responde.

Uma armadilha do próprio nó: ele devolve `pageContent: ""` (string vazia, não `null`) e joga o documento em `metadata`. Ler com `??` não resolve, porque `"" ?? x` devolve `""`. O Code usa `||`, com fallback para `metadata.text` e para os campos crus. Com `??`, a busca acertava os documentos e o agente recebia zero trechos, sem erro em lugar nenhum.

### Por que os trechos passam por um limiar de score

Sem filtro, **todo** trecho que a busca devolvia entrava no prompt. Numa conversa real, uma pergunta sobre agendamento odontológico recebeu esta resposta:

> *"Desculpe — não encontrei essa informação… O tempo de espera pode variar, pois alguns processos possuem prazos definidos (como 15 dias para certos processos administrativos)…"*

O "15 dias" é verdadeiro: vem de uma FAQ sobre prazo de recurso contra auto da Vigilância Sanitária. O bot não inventou: pegou um fato real de um trecho sobre **outro assunto** e o apresentou como pertinente, na mesma resposta em que admitia não saber. Isso é pior que uma alucinação óbvia: um número real e verossímil não dá ao cidadão nenhum sinal de alerta.

Nas perguntas que foram bem, os melhores trechos ficavam entre 0,85 e 0,93. Nessa, entre 0,75 e 0,79. Daí o corte.

**O valor foi calibrado depois, com 81 perguntas de participantes.** As respondidas têm melhor score médio 0,844; as que a base não sabia, 0,815. As distribuições se sobrepõem, e o score absoluto é o único sinal que separa alguma coisa (distância para a média do top-10 e número de palavras da pergunta foram testados e não separam nada). Baixar o corte para 0,80 ganharia 2 respostas corretas e deixaria entrar 8 contextos irrelevantes a mais.

> A conclusão que importa para o planejamento: **pergunta sem resposta aqui é falta de conteúdo na base, não corte apertado.** A correção é escrever as FAQs que faltam, que é o que a tela de curadoria faz.

O limiar precisa ser **o mesmo nos dois fluxos**. Se divergirem, o protótipo deixa de medir o comportamento real e vira outro produto.

### Por que a memória é de 4 mensagens

Uma janela de 10 continha várias respostas anteriores do próprio bot, e um modelo pequeno se ancora nelas: chegava uma pergunta nova mas parecida e ele repetia a resposta anterior em vez de usar o conteúdo novo. Era o "bot viciado" observado em teste.

Junto com a janela menor, o system prompt ganhou uma hierarquia explícita de fontes:

> 1. **TRECHOS DA BASE** = única fonte de conteúdo.
> 2. **HISTÓRICO** = serve só para entender a pergunta ("e o jejum?"). Nunca como fonte de conteúdo.
> 3. **CONHECIMENTO PRÓPRIO** = não é fonte. Se o trecho não diz, você não sabe.

O prompt também diz que **não existe ferramenta de busca** e que a busca já aconteceu, senão o modelo escreve "vou consultar a base para você".

### Uma ideia tentadora que seria um erro

Pular o agente quando a busca não retorna nada economizaria cota e garantiria o texto exato de "não encontrei". **Mas quebraria as saudações**: "oi", "bom dia" e "obrigado" não têm FAQ correspondente e ainda assim precisam de resposta cordial. Por isso o agente é chamado sempre, e é o prompt que decide entre saudar e admitir que não sabe.

### Perguntas de acompanhamento ainda falham

"como chego lá?" é embedado sem referente nenhum: a busca devolve lixo e o agente responde "não encontrei". **A memória não resolve: quem precisava do histórico era a busca, e ela não o vê.**

O atalho óbvio (concatenar a pergunta anterior ao texto da busca) foi medido e **reprovado**:

| Pergunta | Anterior | Só a frase | Com a anterior |
|---|---|---|---|
| "ata e como chego la" | "aeroporto" | 0,776: *"Por que quem chegou depois foi atendido primeiro"* | 0,788: *"A UPA do Aeroporto atende 24 horas?"* |
| "como chego la ?" | "ata e como chego la" | 0,803: *"Como as bactérias chegam ao coração?"* | 0,811: *"NAIA, como entrar em contato"* |
| "E fralda geriatrica?" | "Onde consigo pegar salbutamol?" | 0,813: *"Qualquer médico pode receitar Alendronato?"* | **0,909: *"Onde conseguir Salbutamol gratuito?"*** |

Os dois primeiros continuam abaixo do corte: o tema melhora, mas a base não tem o conteúdo. O terceiro é **pior que falhar**: o score subiu, três trechos passaram, e o melhor deles é sobre salbutamol, a pergunta anterior. A concatenação fez o assunto velho dominar o vetor.

A correção de verdade é **condensação por LLM**, que resolve a referência e descarta o assunto anterior: reescreveria "E fralda geriátrica?" como "Onde consigo pegar fralda geriátrica?". Custa uma chamada de modelo a mais por mensagem, sobre uma latência que já é o maior problema de experiência. Ou se faz assim, ou não se faz.

---

## O dashboard

Repositório separado, clonado em `Dashboard-PetSaude/`. O `.gitignore` da raiz o ignora de propósito, porque ele tem git e remote próprios.

- **back**: NestJS na porta 3333. FAQs no mesmo Mongo do chatbot; identidade (usuários, papéis, sessões) no Postgres, banco separado.
- **front**: TanStack Start na porta 5173.
- Login individual com JWT, três papéis: `admin` (gerencia usuários e FAQs), `editor` (cria/edita/exclui FAQs), `leitor` (só consulta). Sessões revogáveis: desativar um usuário ou trocar a senha derruba o acesso na hora.

Quatro telas nasceram do primeiro teste com participantes, e cada uma resolve um problema concreto:

| Tela | O que resolve |
|---|---|
| **Conversas** (`/conversas`, admin) | As conversas do protótipo, com os trechos que geraram cada resposta e o score de cada um. Clicar num trecho abre a FAQ que o produziu: é o caminho da resposta ruim até o documento que precisa de conserto |
| **Categorias** (`/categorias`) | A lista oficial de assuntos e a fila do que está fora dela |
| **Sem resposta** (`/curadoria`, admin) | As perguntas que o chatbot não soube responder, agrupadas por um modelo em sugestões de FAQ |
| **Testar a busca** (na home das FAQs) | Roda a busca do chatbot para uma pergunta digitada e mostra os scores, sem passar pelo chatbot |

**Por que categorias viraram entidade.** Categoria era um agregado derivado: o resultado de um `$group` sobre o campo `category`. Quem "criava" uma categoria era quem digitava um nome novo no formulário. O resultado foram **236 categorias distintas para ~2500 FAQs**, boa parte a mesma coisa escrita de outro jeito: a criação manual gravava o que foi digitado e a importação forçava minúsculo, então "Exames" e "exames" viraram dois assuntos. Como a categoria entra no texto embedado (`Assunto: …`), para a busca isso são dois temas diferentes. A lista agora tem chave canônica e índice único, e começa **vazia**: quem decide quais assuntos existem é a área de saúde.

**Por que o teste de busca existe.** A única forma de saber por que o chatbot não respondeu algo era mandar a pergunta pelo chat e esperar, sem ver os scores. E o "por quanto" decide o trabalho: *"Onde fica a UBS?"* deu 0,816 contra um corte de 0,82. Sem o número, esse caso e um de conteúdo faltando são indistinguíveis, e a correção de um é o oposto da do outro.

**O que a curadoria custa.** Uma chamada de geração por rodada de até 10 perguntas, e **nenhum embedding**: as FAQs vizinhas já ficaram gravadas em `trechosDebug` quando o chatbot respondeu. O modelo agrupa e propõe, mas **não escreve orientação de saúde**: a resposta sai vazia quando as FAQs fornecidas não continham a informação, e aí a lacuna é de conteúdo mesmo. Toda rodada fica registrada em `curadoria_rodadas`, com as perguntas que entraram e a resposta crua do modelo.

---

## Dependências externas

- **MongoDB Atlas**: base vetorial de FAQs, compartilhada entre chatbot, ingestão e dashboard
- **Google Gemini API**: modelo de chat e embeddings
- **Cloudflare Tunnel**: exposição pública do webhook do n8n

---

## Limites conhecidos

Dívidas em aberto, com o impacto de cada uma:

| Dívida | Onde | Impacto |
|---|---|---|
| `task_type` da busca não é controlado | nó Embeddings do n8n | A ingestão usa `SEMANTIC_SIMILARITY`; o nó usa o padrão dele. O Google recomenda `RETRIEVAL_DOCUMENT` para documentos e `RETRIEVAL_QUERY` para consultas. Alinhar exigiria reindexar a base inteira |
| Credenciais da sessão em disco local (`wa_sessions`) | backend | Não escala para mais de uma réplica |
| Fila de envio em memória | backend | Um restart perde o que estava na fila |
| Entrega ao n8n sem outbox transacional | webhooks | Se o n8n ficar fora além do retry, o evento se perde (fica no log com o `eventId`) |
| n8n valida o token, não a assinatura HMAC | n8n | Proteção menor que a possível; o gateway já envia a assinatura |
| Só recebe e envia texto | backend | Áudio e imagem caem no aviso de somente texto |
| Baileys não-oficial | backend | Risco de bloqueio do número. Ver [caminho-para-producao.md](caminho-para-producao.md) |
| Perguntas de acompanhamento falham | fluxo | Ver a seção acima; a correção custa uma chamada de LLM por mensagem |
| Latência mediana de ~24s | fluxo | É o maior problema de experiência, e ainda não foi medido onde o tempo é gasto (embedding, busca no Atlas, Gemini ou as 3 tentativas do agente) |

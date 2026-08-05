# O que depende de você

Guia prático: o que fazer para **rodar o projeto agora**, na fase de teste, e o que vai precisar ser resolvido **quando o bot sair do grupo** e for atender cidadãos de verdade.

---

## O que é este projeto

Chatbot de saúde no WhatsApp desenvolvido no **PET-SAÚDE** — Programa de Educação pelo Trabalho para a Saúde, do Ministério da Saúde, em que grupos de estudantes desenvolvem projetos aplicados. Daí o "PET" no nome do fluxo original: é o programa, não animal de estimação.

O grupo já teve uma versão rodando em **n8n + Telegram**. A migração para o WhatsApp é por alcance — é o canal que a população realmente usa — e por escalabilidade.

**Situação atual: fase de teste interna.** O bot vai ser testado pelo próprio grupo antes de qualquer atendimento real. Isso muda o que é urgente: nada aqui depende da prefeitura para o bot funcionar hoje.

### Decisões já tomadas (não são pendências)

| Decisão | Situação |
|---|---|
| **Baileys em vez da API oficial da Meta** | Validado conscientemente. A API oficial é difícil de conseguir agora e o código já está preparado para trocar depois — ver [O que já está pronto](#o-que-já-está-pronto-para-a-transição) |
| **Chip dedicado** | Já existe. Vira número institucional quando for para a prefeitura |
| **Rodar na máquina local** | Suficiente para teste. VPS só quando sair do grupo |
| **LGPD do conteúdo das FAQs** | Já sendo tratada pelo grupo, na plataforma de gestão de FAQs |

---

## Para rodar agora

Cinco passos. O passo a passo detalhado está em [docs/chatbot.md](chatbot.md) — aqui fica a versão curta.

### 1. Gerar os segredos

As variáveis do WAHA saíram e entraram outras. No PowerShell, rode **quatro vezes** e use um valor **diferente** em cada campo:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

Preencha no `.env` da raiz (copie de [.env.example](../.env.example)):

```env
GATEWAY_API_KEY=<valor 1>
N8N_WEBHOOK_TOKEN=<valor 2>
N8N_WEBHOOK_SECRET=<valor 3>
REDIS_PASSWORD=<valor 4>
```

### 2. Subir os containers

```powershell
docker compose up -d --build
docker compose ps
```

Todos devem ficar `Up`. O `whatsapp-gateway` leva alguns segundos até ficar `healthy`.

### 3. Parear o WhatsApp

O QR code do WAHA não serve mais — o gateway guarda a sessão em formato próprio, então **é preciso parear de novo** (leva uns 2 minutos):

```powershell
curl.exe -H "X-Api-Key: <GATEWAY_API_KEY>" http://localhost:3000/api/v1/sessions/default/qr --output qr.png
```

Abra o `qr.png` e escaneie em **WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho**. Confirme:

```powershell
curl.exe -H "X-Api-Key: <GATEWAY_API_KEY>" http://localhost:3000/api/v1/sessions/default
```

Deve retornar `"status": "CONNECTED"`.

### 4. Configurar o n8n

Em `http://localhost:5678`:

- Cadastre as credenciais: **Redis** (host `redis`, senha do `.env`), **MongoDB Atlas** e **Google Gemini**
- Crie uma credencial **Header Auth** com nome `X-Webhook-Token` e o valor de `N8N_WEBHOOK_TOKEN`
- Importe [n8n/whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json)
- Vincule as credenciais nos nós e **ative** o workflow

### 5. Testar

Mande uma mensagem de outro celular para o número pareado. Acompanhe em **n8n → Executions**. Se algo falhar:

```powershell
docker compose logs -f whatsapp-gateway
```

---

## O que ainda preciso de você agora

Só dois itens — e os dois afetam o teste, não só a produção.

### 1. Nome do índice vetorial no MongoDB Atlas 🔴

Este é um bug latente que quebra toda a busca de FAQs **em silêncio**. Há três valores conflitantes:

| Onde | Nome do índice | Dimensões |
|---|---|---|
| Workflow do n8n | `vector_index_3072` | — |
| [scripts/enviar_dados.py](../scripts/enviar_dados.py) (cria) | `vector_index` | 3072 |
| [scripts/limpar_banco.py](../scripts/limpar_banco.py) (recria) | `vector_index` | **768** |

Duas consequências concretas:

- Nenhum script cria `vector_index_3072`, que é o índice que o n8n de fato consulta. Ele deve ter sido criado à mão no painel do Atlas — ou seja, **recriar o ambiente do zero não funciona hoje**.
- **Rodar `limpar_banco.py` quebra a busca.** Ele derruba o índice e recria com 768 dimensões, incompatível com os vetores de 3072 que os embeddings geram. A partir daí o bot responde "não encontrei essa informação" para tudo, sem erro nenhum aparecer.

> ⚠️ Enquanto isso não for decidido, **não rode `limpar_banco.py`**.

**Por que agora:** o grupo está construindo a plataforma de gestão de FAQs que vai substituir a lógica dos scripts Python. Fixar o nome canônico agora evita que a plataforma nova nasça com a mesma divergência — ela vai precisar criar e consultar esse índice também.

**Decisão que preciso:** qual é o nome canônico? Com a resposta, alinho os três lugares num commit só.

### 2. Cota do Gemini e dona da chave 🟠

O modelo é `gemini-2.5-flash-lite` na **cota gratuita**. Com o grupo inteiro testando, essa cota acaba rápido — e quando acaba, o bot simplesmente para de responder.

Também vale olhar: a credencial do Gemini cadastrada no n8n se chama **"Felipe Gemini"**. É a chave pessoal de outra pessoa. Para teste tudo bem, mas quando o projeto crescer isso precisa virar uma chave do projeto, não de um indivíduo — se essa pessoa sair do grupo ou revogar a chave, o bot cai.

**Preciso saber:** há billing ativo no Google Cloud, ou é só a cota gratuita? Vale a pena definir um teto de gastos com alerta antes de abrir o teste para mais gente.

Vale conferir também o tier do MongoDB Atlas: se for M0 (gratuito), há limite de conexões simultâneas e de armazenamento.

---

## Quando sair do teste

Nada aqui bloqueia o teste. Mas vale saber com antecedência, porque alguns têm prazo longo.

### Número institucional

O chip dedicado resolve o teste. Para atendimento real, o número precisa ser institucional — não pode ficar amarrado a uma pessoa. Três motivos: a pessoa sai e o canal morre junto; conversas de saúde de cidadãos ficam num aparelho particular (problema direto de LGPD); e não há responsável institucional pelo canal.

### API oficial da Meta — *o gatilho é anterior à necessidade*

Hoje o gateway usa o **Baileys**, biblioteca não-oficial — o mesmo motor que o WAHA já usava por baixo. Trocar o WAHA pelo backend próprio **não aumentou** o risco. Mas o risco existe:

> O WhatsApp pode bloquear o número a qualquer momento, sem aviso e sem recurso. Isso é inerente a qualquer solução não-oficial, e o risco cresce com o volume de mensagens.

Para uso municipal, o destino é a **WhatsApp Cloud API oficial** — a única com garantia contratual e sem risco de banimento. O que a Meta exige, e só a prefeitura pode providenciar:

| Item | Detalhe |
|---|---|
| Meta Business Manager verificado | CNPJ da prefeitura/secretaria e documentos do representante legal |
| Número dedicado **limpo** | Não pode estar registrado em nenhum WhatsApp (nem comum, nem Business). Se estiver, precisa ser desvinculado antes |
| Aprovação do perfil | A Meta revisa nome de exibição e categoria |
| Orçamento | Cobrança por conversa. Conversas iniciadas pelo cidadão têm janela gratuita de 24h; mensagens iniciadas pela prefeitura são pagas e o texto precisa de aprovação prévia |

**A verificação leva semanas** e depende da velocidade dos documentos. Por isso o gatilho para começar o processo é bem antes de precisar dele — na prática, assim que houver definição de que vai para a prefeitura.

### Hospedagem

Rodar na máquina local é adequado para teste. Para atendimento real: VPS, **preferencialmente em região Brasil** (dado de saúde é dado pessoal sensível — LGPD, Art. 11 — e manter o processamento em território nacional simplifica muito a conformidade). Requisito estimado: 2 vCPU / 4 GB RAM.

Precisa de política de backup para três volumes: `wa_sessions` (credenciais do WhatsApp), `n8n_data` (fluxos e credenciais) e `redis_data`. Perder `n8n_data` significa reconfigurar tudo do zero.

### LGPD das conversas

Uma distinção que importa: a LGPD do **conteúdo das FAQs** já está sendo tratada pelo grupo. As **conversas** — mensagens de cidadãos reais — são outro conjunto de dados, e ainda em aberto. Elas se enquadram no Art. 11 (dados pessoais sensíveis), o regime mais restritivo da lei:

- [ ] Base legal do tratamento (para órgão público, normalmente execução de política pública — Art. 11, II, "b")
- [ ] Encarregado de dados (DPO) designado
- [ ] Política de privacidade publicada
- [ ] Aviso na primeira mensagem: que é canal automatizado, que as mensagens são registradas, onde consultar a política
- [ ] Prazo de retenção das conversas
- [ ] Fluxo de opt-out ("PARAR") e de exercício de direitos do titular

Do lado técnico já está feito o que dá para fazer sem essas definições: o gateway **nunca grava o conteúdo das mensagens em log** (registra só o tamanho do texto) e os segredos são mascarados.

### Identificação do cliente

Quando houver definição de qual prefeitura/secretaria, isso destrava de uma vez a política de privacidade, a base legal da LGPD, o perfil na Meta e o nome oficial do bot.

---

## O que já está pronto para a transição

Nada do que está acima exige reescrever o projeto. O que já está no lugar:

- **Troca de provedor sem mexer no domínio.** A porta [`WhatsAppProvider`](../backend/src/channels/whatsapp/domain/whatsapp-provider.port.ts) isola o Baileys atrás de uma interface. Migrar para a Cloud API da Meta é escrever um segundo adapter — o resto do backend não muda.
- **Configuração validada no boot.** [`env.schema.ts`](../backend/src/config/env.schema.ts) rejeita a aplicação se faltar segredo ou se uma URL estiver malformada, em vez de falhar em produção.
- **Política anti-ban ativa.** Envios são serializados, com atraso aleatório e "digitando" simulado — o que reduz o risco enquanto o número for não-oficial.
- **Sem vazamento de dado sensível em log.** O texto das mensagens nunca é registrado.

---

## Resumo

| Item | Depende de | Quando |
|---|---|---|
| Nome do índice vetorial | **Você** | **Agora** — a busca já está frágil |
| Cota/billing do Gemini e dona da chave | **Você** | **Agora** — a cota gratuita acaba no teste |
| Número institucional | Prefeitura | Ao sair do teste |
| API oficial da Meta | Prefeitura (CNPJ, documentos) | Começar semanas antes de precisar |
| Hospedagem em VPS | Você + orçamento | Ao sair do teste |
| LGPD das conversas | Prefeitura / DPO | Antes de atender cidadãos |
| Identificação do cliente | Prefeitura | Destrava LGPD, Meta e nome do bot |

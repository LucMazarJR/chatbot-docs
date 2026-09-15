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
| **Gemini só na cota gratuita** | Sem billing ativo no Google Cloud. Quando a cota do dia acaba, o bot para de responder até o dia seguinte — por isso o checklist de cota em [prototipo-pwa.md](prototipo-pwa.md#levar-para-um-posto-de-saúde) antes de cada teste |
| **Condensação de query adiada** | Perguntas de continuação ("como chego lá?") seguem falhando. O atalho barato foi medido e reprovado ([chatbot.md](chatbot.md#o-atalho-da-condensação-não-funciona)); a correção completa custa uma chamada de LLM a mais por mensagem e fica para ser levantada depois |
| **Segredos do n8n mantidos** | A interface do n8n ficou alcançável pela internet até ser restrita a `/webhook/*` no Cloudflare. Os segredos guardados nele (URI do Atlas, chaves do Gemini, senha do Redis, tokens dos webhooks) continuam os mesmos, por decisão consciente |

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

Nada bloqueia o teste hoje. Os dois itens que estavam aqui foram resolvidos:

- **Nome do índice vetorial.** Os quatro lugares usam `vector_index_3072` com 3072 dimensões: os dois fluxos do n8n, o [enviar_dados.py](../scripts/enviar_dados.py), que cria o índice, e o [limpar_banco.py](../scripts/limpar_banco.py), que o recria. Recriar o ambiente do zero volta a funcionar, e rodar o `limpar_banco.py` deixou de quebrar a busca.
- **Cota do Gemini.** Decidido: só a cota gratuita — ver [Decisões já tomadas](#decisões-já-tomadas-não-são-pendências).

Duas observações que continuam valendo:

- O fluxo do WhatsApp ainda usa a credencial **"Felipe Gemini"**, chave pessoal de outra pessoa; o do protótipo já usa a própria (**"Gemini PWA"**). Enquanto o WhatsApp for só teste isso não pesa, mas antes de ele atender alguém a chave precisa ser do projeto — se a pessoa sair do grupo ou revogar a chave, o bot cai.
- Vale conferir o tier do MongoDB Atlas: se for M0 (gratuito), há limite de conexões simultâneas e de armazenamento.

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

Uma distinção que importa: a LGPD do **conteúdo das FAQs** já está sendo tratada pelo grupo. As **conversas** — mensagens de cidadãos reais — são outro conjunto de dados, e se enquadram no Art. 11 (dados pessoais sensíveis), o regime mais restritivo da lei.

**Já feito, no protótipo PWA:**

- [x] **Base legal para o teste:** consentimento (Art. 7º, I, e Art. 11, I). A conversa só começa depois de tocar em *Aceitar*, e a data do aceite ou da recusa fica gravada na sessão.
- [x] **Política de privacidade publicada** em `/privacidade`, escrita para quem está no posto: o que fica registrado, para que, quem mais recebe (Gemini e MongoDB Atlas), por quanto tempo e como exercer os direitos. O prazo que ela mostra é lido do ambiente, então a página não promete um número diferente do que o banco aplica.
- [x] **Aviso antes da primeira pergunta:** o pedido de aceite diz que é um protótipo e que as mensagens ficam registradas, e a política tem link no aviso do topo da conversa, no menu e no painel de acessibilidade.
- [x] **Prazo de retenção aplicado pelo banco:** as conversas se apagam sozinhas em `PWA_RETENCAO_DIAS` (180 por padrão), por índice TTL. A memória do agente no Redis expira em 1 hora, e as execuções do n8n são podadas em 14 dias.
- [x] **Exclusão a pedido do titular,** por duas portas: a própria pessoa, no menu do chat (*Apagar minha conversa*), ou a equipe, pela transcrição em `/conversas` do dashboard, para quem não tem mais a conversa no aparelho. As duas apagam também as cópias das perguntas que a curadoria guarda em `sugestoes_faq` e `curadoria_rodadas`, e a do dashboard fica registrada no histórico sem nenhum conteúdo.

**Continua dependendo da instituição:**

- [ ] **Base legal para o serviço de verdade.** Consentimento serve a um teste com voluntários. Para um órgão público atendendo a população, a base costuma ser execução de política pública (Art. 11, II, "b"), e quem define é a instituição.
- [ ] **Encarregado de dados (DPO)** designado. Quando houver, o contato vai em `PWA_CONTATO_PRIVACIDADE` e a página de privacidade passa a mostrá-lo; hoje ela orienta a procurar a pessoa responsável pelo teste.
- [ ] **Política oficial do órgão.** A página do protótipo descreve o protótipo, não substitui a política da instituição.
- [ ] **Opt-out ("PARAR") no WhatsApp.** O canal do WhatsApp ainda não atende ninguém; quando atender, precisa do mesmo direito de exclusão que o protótipo já tem.

No gateway do WhatsApp, o conteúdo das mensagens **nunca vai para o log** (fica registrado só o tamanho do texto) e os segredos são mascarados.

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
| Nome do índice vetorial | — | ✅ Resolvido: `vector_index_3072` em todos os lugares |
| Cota do Gemini | — | ✅ Decidido: só a cota gratuita |
| Chave do Gemini do fluxo do WhatsApp | Você | Antes de o WhatsApp atender alguém |
| Número institucional | Prefeitura | Ao sair do teste |
| API oficial da Meta | Prefeitura (CNPJ, documentos) | Começar semanas antes de precisar |
| Hospedagem em VPS | Você + orçamento | Ao sair do teste |
| LGPD das conversas — protótipo | — | ✅ Consentimento, política, retenção e exclusão feitos |
| LGPD das conversas — serviço real | Prefeitura / DPO | Antes de atender cidadãos |
| Identificação do cliente | Prefeitura | Destrava LGPD, Meta e nome do bot |

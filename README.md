# Chatbot de Atendimento via WhatsApp

Chatbot que recebe mensagens do WhatsApp, consulta uma base de FAQs vetorial e responde com o modelo Gemini.

Projeto do **PET-SAÚDE** — Programa de Educação pelo Trabalho para a Saúde, do Ministério da Saúde, em que grupos de estudantes desenvolvem projetos aplicados. O domínio é saúde humana e serviços públicos de saúde.

Quatro peças, responsabilidades separadas:

- **[backend/](backend/)** — gateway próprio de WhatsApp em NestJS. Dono do canal: conexão, sessão, deduplicação, política anti-ban e formatação. **Substitui o WAHA.**
- **[n8n/](n8n/)** — dono da inteligência: agente Gemini, busca vetorial e memória da conversa.
- **[pwa/](pwa/)** — protótipo de validação: o mesmo RAG numa interface web com cara de WhatsApp, que pede uma nota ao final e registra as conversas para análise.
- **Dashboard-PetSaúde** — painel de gestão das FAQs, em [repositório próprio](https://github.com/LucMazarJR/Dashboard-PetSaude). Escreve na mesma base que o chatbot lê.

## Estrutura

```
chatbot-docs/
├── docker-compose.yml         # gateway, n8n, redis, cloudflared, postgres, pwa, dashboard
├── .env.example               # modelo das variáveis
├── backend/                   # whatsapp-gateway (NestJS)
│   ├── src/
│   │   ├── channels/whatsapp/ # porta + adapter Baileys
│   │   ├── sessions/          # ciclo de vida, QR, status
│   │   ├── inbound/           # normalização e deduplicação
│   │   ├── outbound/          # envio, fila anti-ban, formatação
│   │   ├── webhooks/          # entrega assinada ao n8n
│   │   └── health/
│   └── README.md              # arquitetura interna e API do gateway
├── docs/                      # ver a tabela abaixo
├── n8n/
│   ├── whatsapp-chatbot.json  # fluxo do canal — rota /webhook/whatsapp
│   └── pwa-chatbot.json       # fluxo do protótipo — rota /webhook/pwa-chat
├── pwa/                       # protótipo de validação (Next.js + TypeScript)
│   ├── src/app/               # o chat e as rotas de API que falam com o n8n e o Mongo
│   ├── src/lib/               # Mongo, contrato com o n8n e formatação do WhatsApp
│   └── public/                # manifest, service worker e ícones
└── scripts/                   # ingestão de FAQs: Drive → embeddings → MongoDB
```

## Início rápido

```powershell
# 1. Copie o .env e gere os segredos (um valor diferente para cada)
cp .env.example .env
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })

# 2. Suba tudo
docker compose up -d --build

# 3. Pareie o WhatsApp
#    Antes: desconecte todos os aparelhos no WhatsApp do celular.
#    O QR não sai desenhado no log com NODE_ENV=production — baixe o PNG.

# 4. Importe o fluxo no n8n: http://localhost:5678
#    Arquivo: n8n/whatsapp-chatbot.json
```

O passo a passo completo está em [docs/instalacao.md](docs/instalacao.md).

## Documentação

| Documento | Para quê |
|---|---|
| [docs/arquitetura.md](docs/arquitetura.md) | Como o sistema funciona e **por que** é assim: as peças, os contratos, o fluxo do n8n e as decisões que sustentam a qualidade das respostas |
| [docs/instalacao.md](docs/instalacao.md) | Subir tudo do zero numa máquina nova, com checklist e verificações que não gastam cota |
| [docs/base-de-faqs.md](docs/base-de-faqs.md) | O conteúdo: formato do documento, índice vetorial, ingestão pelo Drive e manutenção dos embeddings |
| [docs/prototipo-pwa.md](docs/prototipo-pwa.md) | O protótipo de validação: subir, distribuir aos participantes e ler os resultados |
| [docs/armadilhas.md](docs/armadilhas.md) | **O que quebra em silêncio.** Comece por aqui quando algo estranho acontecer |
| [docs/privacidade-e-lgpd.md](docs/privacidade-e-lgpd.md) | O que é guardado, por quanto tempo, quem alcança, e o que depende da instituição |
| [docs/caminho-para-producao.md](docs/caminho-para-producao.md) | O que precisa estar resolvido antes de atender cidadãos de verdade |
| [backend/README.md](backend/README.md) | Arquitetura interna do gateway e referência da API |

> ⚠️ `scripts/limpar_banco.py` apaga a base inteira e recria o índice. Exige `--confirmo-apagar-tudo` e confirmação digitada, mas **exporte antes** com `backup_faqs.py`.

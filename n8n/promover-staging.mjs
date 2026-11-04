// Gera o fluxo do `/` (pwa-chatbot.json) a partir do fluxo do staging.
//
// Promover o staging é copiar o fluxo inteiro, e não refazer à mão nó por nó:
// cópia manual esquece um prazo, uma reserva ou um aviso de etapa, e o `/`
// passa a se comportar diferente do que foi validado sem erro em lugar
// nenhum. Mudam só quatro coisas, que são do `/` e não do staging:
//
// - o id e o nome do fluxo, para a importação substituir o do `/`;
// - o caminho e o `webhookId` do webhook, para o PWA continuar chegando em
//   `/webhook/pwa-chat` sem mudar variável nenhuma;
// - a credencial do Gemini, que vira a do `/` (`Gemini PWA`) em todos os nós.
//   O staging usa chaves de outros projetos justamente para os testes da
//   equipe não gastarem a cota de quem conversa no `/`.
//
// Uso: node n8n/promover-staging.mjs, e depois importar e publicar o
// pwa-chatbot.json no n8n, como em docs/prototipo-pwa.md.

import { readFileSync, writeFileSync } from 'node:fs';

const caminho = (nome) => new URL(`./${nome}`, import.meta.url);
const ler = (nome) => JSON.parse(readFileSync(caminho(nome), 'utf8'));

const staging = ler('pwa-chatbot-staging.json');
const raiz = ler('pwa-chatbot.json');

const ehWebhook = (no) => no.type === 'n8n-nodes-base.webhook';
const webhookDoRaiz = raiz.nodes.find(ehWebhook);
const credencialDoRaiz = raiz.nodes.map((no) => no.credentials?.googlePalmApi).find(Boolean);
if (!webhookDoRaiz || !credencialDoRaiz) {
  throw new Error('o pwa-chatbot.json atual não tem webhook ou credencial do Gemini para copiar');
}

const promovido = structuredClone(staging);
promovido.id = raiz.id;
promovido.name = raiz.name;
for (const no of promovido.nodes) {
  if (ehWebhook(no)) {
    no.parameters.path = webhookDoRaiz.parameters.path;
    no.webhookId = webhookDoRaiz.webhookId;
  }
  if (no.credentials?.googlePalmApi) no.credentials.googlePalmApi = { ...credencialDoRaiz };
}

// Mesmo formato dos arquivos exportados do n8n neste repositório: dois espaços
// e quebra de linha do Windows, para o diff mostrar só o que mudou.
writeFileSync(caminho('pwa-chatbot.json'), `${JSON.stringify(promovido, null, 2).replace(/\n/g, '\r\n')}\r\n`);

const credenciais = new Set(promovido.nodes.map((no) => no.credentials?.googlePalmApi?.name).filter(Boolean));
console.log(
  `pwa-chatbot.json gerado do staging: ${promovido.nodes.length} nós, webhook /${webhookDoRaiz.parameters.path}, credencial ${[...credenciais].join(', ')}`,
);

# Proposta: RAG determinístico

> **Status: proposta, para discussão do grupo.** Nada aqui está ativo.
> O fluxo atual ([n8n/whatsapp-chatbot.json](../n8n/whatsapp-chatbot.json)) **não foi alterado**.
> A proposta vive num arquivo separado, [n8n/whatsapp-chatbot-rag-deterministico.json](../n8n/whatsapp-chatbot-rag-deterministico.json), que pode ser importado e testado lado a lado.

Este documento existe para embasar a conversa: o que está errado hoje, por que, o que muda, e o que fica de fora de propósito.

---

## Os problemas

### 1. A busca não acontece sempre

Hoje o vector store está ligado ao agente como **ferramenta**:

```json
{ "mode": "retrieve-as-tool", "toolDescription": "Base oficial de FAQs..." }
```
```
MongoDB Atlas Vector Store --ai_tool--> AI Agent
```

Isso significa que **quem decide se vai buscar é o LLM**. O modelo em uso é o `gemini-2.5-flash-lite` — pequeno e barato, e com tool-calling irregular. Quando ele não chama a ferramenta, responde com conhecimento próprio (risco de alucinação) ou diz que não encontrou.

O system prompt tenta compensar com *"Sempre buscar FAQs correspondentes antes de qualquer outra coisa"*. Mas isso é **garantia por pedido, não por estrutura** — e é exatamente o tipo de garantia que um modelo pequeno quebra sob pressão de contexto.

### 2. A memória "vicia" o bot

```json
{ "sessionTTL": 3600, "contextWindowLength": 10 }
```

Uma janela de 10 mensagens contém as **respostas anteriores do próprio bot**. Um modelo pequeno se ancora nelas: chega uma pergunta nova mas parecida, e ele repete a resposta que já deu em vez de usar informação nova. É o comportamento de "ficar viciado" observado no teste.

Os dois problemas se retroalimentam: quando a busca não acontece (problema 1), a única coisa no contexto é o histórico — então repetir a resposta anterior vira a saída mais provável.

### 3. FAQs desativadas continuam sendo respondidas

Achado da análise, não relatado no teste:

```json
{ "metadata_field": "isActive, category" }
```

`metadata_field` define quais campos **voltam** junto com o resultado. **Não é filtro.** Não existe pré-filtro em lugar nenhum do nó — ou seja, documentos com `isActive: false` participam normalmente da busca e podem ser usados numa resposta.

Isso importa mais agora do que antes: com a plataforma de gestão de FAQs em construção, **desativar uma FAQ lá não vai tirá-la das respostas do bot**. Uma FAQ errada ou desatualizada continuaria em circulação depois de "desligada".

---

## A mudança

Tirar a decisão de buscar das mãos do modelo e colocar a busca no fluxo principal, sempre.

**Antes** — o agente decide:
```
Switch → AI Agent ⇄ (ai_tool) Vector Store
```

**Depois** — a busca sempre acontece, e o resultado chega pronto no prompt:
```
Switch → Buscar FAQs → Montar contexto → AI Agent → Enviar resposta
         (mode: load)   (Code)            (sem ferramenta)
```

O agente deixa de ser um agente com ferramentas e vira o que ele deveria ser aqui: um **redator** que recebe pergunta + trechos e escreve uma resposta.

### Por que essa mudança não é só "arrastar um nó"

Dois detalhes quebram o fluxo se passarem despercebidos — e são a razão de existir o nó Code.

**Fan-out.** O vector store no fluxo principal emite **um item por documento**. Com `topK: 5`, o AI Agent rodaria 5 vezes e o cidadão receberia **5 mensagens** para uma pergunta. O nó Code roda em *Run Once for All Items* e devolve um item só.

**Perda de campos.** A saída do vector store substitui o formato do item, derrubando `IdChat`, `EventId`, `SessionId` e `CorrelationId`. Isso quebraria os três nós de envio **e** o `sessionKey` da memória (que lê `$json.IdChat`). O Code relê esses campos do nó `Dados` e reanexa.

**Busca vazia.** Se nenhum documento é encontrado, o nó emitiria zero itens — e no n8n, um nó que emite zero itens **não aciona os nós seguintes**. O cidadão ficaria sem nenhuma resposta. Por isso o nó `Buscar FAQs` está com `alwaysOutputData: true`: ele emite um item vazio, o Code detecta `TemContexto: false`, e o agente ainda responde.

### O nó Code, na íntegra

Já validado contra os dois formatos de documento, contra a busca vazia e contra o fan-out de 5 documentos:

```js
const dados = $('Dados').first().json;

const trechos = [];

for (const item of $input.all()) {
  // O formato do documento muda entre versões do nó: às vezes vem em
  // json.document, às vezes direto em json. Aceita os dois.
  const doc = item.json?.document ?? item.json ?? {};
  const texto = doc.pageContent ?? doc.text ?? '';

  if (typeof texto === 'string' && texto.trim() !== '') {
    trechos.push(texto.trim());
  }
}

const contexto = trechos
  .map((texto, i) => `[Trecho ${i + 1}]\n${texto}`)
  .join('\n\n');

return [
  {
    json: {
      ...dados,
      ContextoFaq: contexto,
      TemContexto: trechos.length > 0,
      QtdTrechos: trechos.length,
    },
  },
];
```

### O que chega ao agente

O campo `text` do AI Agent passa a montar pergunta + contexto:

```
Pergunta do cidadão:
{{ $json.TextoMensagem }}

===== TRECHOS DA BASE DE FAQs =====
{{ $json.TemContexto ? $json.ContextoFaq : 'NENHUM TRECHO ENCONTRADO NA BASE.' }}
===== FIM DOS TRECHOS =====
```

### Memória: de 10 para 4

`contextWindowLength: 10 → 4` (2 turnos), TTL mantido em 1 hora.

E o system prompt ganha uma hierarquia de fontes explícita, que é o antídoto direto para o "viciado":

> 1. **TRECHOS DA BASE** = única fonte de CONTEÚDO.
> 2. **HISTÓRICO** = serve só para ENTENDER a pergunta (resolver "e sobre isso?", "e o jejum?"). Nunca como fonte de conteúdo. Nunca repita uma resposta anterior só porque a pergunta pareceu parecida.
> 3. **CONHECIMENTO PRÓPRIO** = não é fonte. Se o trecho não diz, você não sabe.

O prompt também passa a dizer explicitamente que **não existe ferramenta de busca** e que a busca já aconteceu — senão o modelo escreve coisas como "vou consultar a base para você".

---

## Trade-off que o grupo precisa decidir

Com busca determinística, a consulta usada é a **mensagem crua**. Isso piora perguntas de acompanhamento:

| Cidadão diz | Consulta enviada ao banco | Resultado |
|---|---|---|
| "preciso de jejum para o exame de zinco?" | a frase inteira | 👍 recupera bem |
| "e quanto tempo?" | `e quanto tempo?` | 👎 recupera lixo — a consulta perdeu o assunto |

A solução completa chama-se **condensação de query**: um passo de LLM antes da busca que reescreve "e quanto tempo?" em "quanto tempo de jejum para o exame de zinco?", usando o histórico. Depois busca, depois o agente responde sem memória nenhuma.

**Recomendação: não fazer isso agora.** Dobra as chamadas de LLM por mensagem, e o projeto está na cota gratuita do Gemini — que já é uma preocupação em [depende-de-voce.md](depende-de-voce.md). Vale implementar **se** o teste mostrar que perguntas de acompanhamento estão falhando com frequência. Fica registrado aqui como o próximo passo, não como pendência.

## Uma ideia tentadora que seria um erro

Pular o agente quando a busca não retorna nada economizaria cota e garantiria o texto exato de "não encontrei".

**Mas quebraria as saudações.** "oi", "bom dia" e "obrigado" não têm FAQ correspondente e mesmo assim precisam de resposta cordial — com esse atalho, o cidadão receberia "não encontrei essa informação" ao dizer bom dia. Por isso o agente continua sendo chamado sempre, e é o prompt que decide entre saudação e "não encontrei".

---

## O que conferir ao importar — declaração de incerteza

Não tenho uma instância do n8n rodando para verificar os nomes exatos dos campos do nó MongoDB Atlas Vector Store no modo `load`. O JSON é a melhor aproximação; **o Code node e o system prompt — onde está a lógica de verdade — não têm essa incerteza** (o Code foi testado).

Ao abrir o nó `Buscar FAQs` no n8n, confira três coisas:

| Campo | Valor esperado | Se vier vazio |
|---|---|---|
| **Operation Mode** | `Get Many` / `Load` | Selecione na lista. É o campo mais importante — se ficar em *Retrieve as Tool*, a proposta inteira não tem efeito |
| **Prompt / Query** | `{{ $json.TextoMensagem }}` | Cole a expressão manualmente |
| **Limit / Top K** | `5` | Digite. Se não existir esse campo, procure em *Options* |

Depois de corrigir na UI, **reexporte o workflow** para o arquivo, para que o JSON do repositório fique fiel ao que funciona.

### Pré-filtro de `isActive` (problema 3)

Este é o item que provavelmente vai exigir ajuste manual. Em *Options* do nó, procure por **Metadata Filter** / **Pre Filter** e adicione a condição `isActive = true`. O formato varia por versão do nó; em algumas é um par chave/valor, em outras é um JSON de filtro do MongoDB:

```json
{ "isActive": { "$eq": true } }
```

Se essa opção não existir na versão instalada, a alternativa é filtrar no nó Code — pior (os documentos desativados ainda consomem espaço no `topK`), mas funciona:

```js
const meta = doc.metadata ?? {};
if (meta.isActive === false) continue;
```

---

## Como testar

A proposta usa um caminho de webhook próprio (`/webhook/whatsapp-rag` em vez de `/webhook/whatsapp`), então **os dois fluxos podem ficar ativos ao mesmo tempo** — não há conflito de rota. Trocar entre eles é mudar uma variável.

1. Importar [n8n/whatsapp-chatbot-rag-deterministico.json](../n8n/whatsapp-chatbot-rag-deterministico.json) e vincular as credenciais (Redis, MongoDB, Gemini, Header Auth).
2. Conferir o nó `Buscar FAQs` conforme a tabela acima.
3. Ativar o workflow.
4. Apontar o gateway para ele, no `.env`:
   ```env
   N8N_WEBHOOK_URL=http://n8n:5678/webhook/whatsapp-rag
   ```
5. `docker compose up -d whatsapp-gateway`

Para voltar ao fluxo atual, é só devolver `N8N_WEBHOOK_URL` para `.../webhook/whatsapp` e reiniciar.

### Roteiro de teste

| # | O que mandar | O que precisa acontecer |
|---|---|---|
| 1 | Pergunta que existe na base | Resposta correta. Na execução do n8n, `Buscar FAQs` mostra documentos recuperados **antes** do agente |
| 2 | Pergunta fora do escopo da base | Texto exato de "não encontrei essa informação nos recursos disponíveis" |
| 3 | "oi" | Saudação cordial — **não** pode cair no "não encontrei" |
| 4 | **Três perguntas seguidas sobre exames diferentes** | As três respostas precisam ser **diferentes entre si**. Este é o teste que reproduz o "ficava viciado" |
| 5 | Qualquer pergunta | **Uma única mensagem** de volta. Mais de uma significa que a agregação falhou |
| 6 | Uma pergunta e depois "e quanto tempo?" | Aqui é onde o trade-off aparece. Se falhar com frequência, é o sinal para implementar condensação de query |

O teste 4 é o mais importante da lista: é o único que valida a hipótese central desta proposta.

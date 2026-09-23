# Avisos push

Notificações no celular de quem tem conta no chat, para lembrar de exame, de consulta e dar recados da equipe. Por enquanto existem **só no `/staging`** do protótipo PWA, em validação: a pergunta é se o push na web chega de verdade no tipo de aparelho que o público usa.

Contas e login estão em [contas-de-usuario.md](contas-de-usuario.md). O que é guardado e por quanto tempo, em [privacidade-e-lgpd.md](privacidade-e-lgpd.md).

---

## Como funciona

```
 Dashboard (equipe)                       PWA (Next)                          Aparelho
 ──────────────────                       ──────────                          ────────
 /notificacoes ──grava──► pwa_prototipo.notificacoes (fila)
                                  ▲              │
                                  │   despachante (a cada 30 s,
                     recibos ─────┘   reivindicação atômica) ──web-push──► Google / Apple / Mozilla ──► SW /staging/sw.js
                     (exibida, aberta)                                                                    │
                                                                             toque ──► /staging/avisos/:id
```

A regra que organiza tudo: **quem cria aviso só escreve na fila; quem envia é um só**, o despachante do PWA. O dashboard não fala com serviço de push nenhum. Um produtor novo (uma integração com a agenda, uma campanha automática) é só mais alguém gravando documentos pendentes, e não precisa saber de chaves, retentativas ou prazos.

Isso também quer dizer que o dashboard pode cair sem que nada do que já foi agendado deixe de sair. O que não pode cair é o container do PWA, onde o despachante roda.

---

## A fila

Coleção `pwa_prototipo.notificacoes`, **um documento por pessoa**. O dono do formato é [pwa/src/lib/notificacoes/tipos.ts](../pwa/src/lib/notificacoes/tipos.ts).

| Campo | O que é |
|---|---|
| `_id` | UUID em string |
| `loteId` | Agrupa os avisos de um mesmo envio do dashboard. `null` no teste que a pessoa manda para si mesma |
| `usuarioId` | A conta que recebe |
| `tipo` | `lembrete-exame`, `lembrete-consulta`, `aviso` ou `teste` |
| `detalhe` | O texto completo, que aparece **dentro** do app |
| `mostrarDetalhe` | Deixa o texto aparecer também na tela bloqueada. `false` por padrão |
| `enviarEm` | A partir de quando pode sair. Uma retentativa empurra este campo para frente |
| `validaAte` | Depois disto o aviso é descartado, não enviado |
| `estado` | Ver abaixo |
| `tentativas`, `travadaAte` | Controle do despachante |
| `recibo` | Segredo gerado no envio, que o aparelho devolve nos recibos |
| `entregas[]` | Uma por aparelho, por tentativa: resultado, código HTTP, user agent, `exibidaEm`, `abertaEm` |
| `motivo` | Por que não saiu, em português |
| `criadaEm`, `criadaPor` | Quando e quem (nome) |
| `enviadaEm`, `exibidaEm`, `abertaEm` | A primeira vez de cada coisa, em qualquer aparelho |
| `expiraEm` | Preenchido quando o aviso sai da fila; o índice TTL apaga o documento nessa data |

Para criar um aviso por fora do dashboard, grave o documento com **todos** os campos, `estado: 'pendente'`, `tentativas: 0` e os demais nulos ou vazios, exatamente como `montarAvisos`, em [Dashboard-PetSaude/back/src/notificacoes/regras.ts](../Dashboard-PetSaude/back/src/notificacoes/regras.ts). Um campo com nome errado não gera erro: o aviso fica parado na fila para sempre.

### Estados

```
 pendente ──► enviando ─┬─► enviada
    ▲                   ├─► falhou     (nenhum aparelho aceitou, ou a conta não tem aparelho)
    │                   ├─► expirada   (passou de validaAte antes de sair)
    └── retentativa ────┘

 pendente ──► cancelada                (pelo dashboard, só enquanto pendente)
```

`expirada`, `falhou`, `enviada` e `cancelada` são finais: o aviso ganha `expiraEm` e some **90 dias** depois.

---

## Os tipos, e o que aparece na tela bloqueada

O registro fica em `TIPOS`, no mesmo `tipos.ts`. É o único lugar com texto e urgência de cada tipo:

| Tipo | Título na tela bloqueada | Urgência |
|---|---|---|
| `lembrete-exame` | "Você tem um lembrete" | alta |
| `lembrete-consulta` | "Você tem um lembrete" | alta |
| `aviso` | "Novo aviso da equipe de saúde" | normal |
| `teste` | "Notificação de teste" | normal |

**O título nunca diz do que é o lembrete.** A notificação aparece na tela bloqueada, e o celular fica na mesa do trabalho, na mão do filho, no painel do carro. "Exame de HIV amanhã" ali é vazamento de dado de saúde. O texto só aparece dentro do app, com a conta logada, em `/staging/avisos/:id`: a não ser que quem criou tenha marcado `mostrarDetalhe`, e o formulário do dashboard avisa o que isso significa antes.

### Criar um tipo novo

O tipo existe em três lugares, e os três precisam mudar juntos:

1. [pwa/src/lib/notificacoes/tipos.ts](../pwa/src/lib/notificacoes/tipos.ts): `TIPOS_DE_NOTIFICACAO` e `TIPOS`, que é quem monta a notificação.
2. [Dashboard-PetSaude/back/src/notificacoes/tipos.ts](../Dashboard-PetSaude/back/src/notificacoes/tipos.ts): a lista, `TIPOS_DA_EQUIPE` se a equipe puder enviar, e o rótulo.
3. [Dashboard-PetSaude/front/src/lib/notificacoes.functions.ts](../Dashboard-PetSaude/front/src/lib/notificacoes.functions.ts): a prévia do formulário.

---

Para avisos que se criam sozinhos a partir de uma regra (lembrete de consulta, confirmação de que os avisos funcionam), existe o caminho dos gatilhos: [gatilhos-de-avisos.md](gatilhos-de-avisos.md).

---

## O despachante

[pwa/src/lib/notificacoes/despachante.ts](../pwa/src/lib/notificacoes/despachante.ts), função `despachar()`. Cada rodada pega até 100 avisos vencidos, do mais antigo para o mais novo.

- **Reivindicação atômica.** Cada aviso passa de `pendente` para `enviando` num `findOneAndUpdate`, com uma trava de 2 minutos. Duas instâncias rodando juntas (o Docker e um relógio externo, duas réplicas) não enviam o mesmo aviso duas vezes. Aviso preso em `enviando` com a trava vencida é de uma rodada que morreu no meio, e volta a ser pego.
- **Vencido não sai.** Passou de `validaAte`, vira `expirada`. Com o PC desligado a noite toda, "seu exame é daqui a 2 horas" chegaria 10 horas depois: pior do que não chegar, porque a pessoa pode acreditar.
- **Envia para todos os aparelhos da conta**, com o TTL do serviço de push igual ao tempo que falta até `validaAte` (entre 1 minuto e 4 semanas, o intervalo que os serviços aceitam).
- **Resposta do serviço:**

| Código | Significa | O que acontece |
|---|---|---|
| 2xx | Aceito | `enviada` |
| 404, 410 | O aparelho desinstalou, limpou os dados ou revogou a permissão | A inscrição é **apagada** |
| 401, 403 | A inscrição foi feita com outras chaves VAPID | A inscrição é apagada |
| 429, 5xx, sem resposta | Serviço sobrecarregado ou fora | Volta a `pendente` com espera de 1, 5, 15 e 60 minutos, até 5 tentativas |
| outro 4xx | O pedido em si está errado | `falhou` |

- **Payload mínimo**: id, recibo, título, corpo curto, endereço e tag. A `tag` é por aviso, então uma retentativa que chega duas vezes substitui a notificação em vez de empilhar.

### O relógio

[pwa/src/instrumentation.ts](../pwa/src/instrumentation.ts) chama `despachar()` a cada 30 segundos, com a primeira rodada 10 segundos depois de o servidor subir. Só roda no servidor Node do Docker: fica desligado na Vercel, onde não há processo que continue vivo entre requisições, e durante o build.

`PWA_DESPACHANTE=desligado` desliga o relógio. Só faz sentido se outro relógio assumir, chamando:

```powershell
curl.exe -X POST http://localhost:8080/api/notificacoes/despachar -H "x-webhook-token: <N8N_PWA_WEBHOOK_TOKEN>"
```

Não há nada a importar no n8n para os avisos saírem.

### As chaves VAPID

São geradas **na primeira vez que alguém ativa os avisos** e guardadas em `pwa_prototipo.configuracoes`, documento `vapid`. Docker e Vercel usam o mesmo banco, então enviam com as mesmas chaves, com chaves por ambiente, uma inscrição feita pela Vercel seria recusada quando o Docker enviasse.

`VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` sobrescrevem as do banco, e `VAPID_SUBJECT` o contato que vai no cabeçalho do envio. Não é preciso preencher nada disso.

> ⚠️ **Trocar as chaves invalida todos os aparelhos inscritos.** Os serviços passam a responder 401/403, o despachante apaga as inscrições, e cada pessoa precisa ativar os avisos de novo. Apagar o documento `vapid` tem o mesmo efeito.

### Recibos

O service worker ([pwa/public/staging/sw.js](../pwa/public/staging/sw.js)) chama `POST /api/notificacoes/recibos` ao **mostrar** a notificação e ao **tocar** nela. É o que transforma "validar o push" em número: "enviada" só quer dizer que o serviço aceitou; se apareceu na tela, só o aparelho sabe.

O service worker não prova identidade de conta. A prova é o `recibo`, um segredo que só viajou dentro do push criptografado. Só a primeira vez de cada evento conta.

---

## Isolamento do `/`

O chat do `/` está em teste de campo e não pode mudar. Por isso o staging tem **service worker e manifest próprios**, com escopo `/staging/` ([pwa/public/staging/](../pwa/public/staging/)). O `sw.js` do `/` não sabe que push existe. O do staging é servido com `Cache-Control: no-cache`, para uma versão nova chegar na hora.

---

## As telas

**No chat, `/staging/avisos`**: diagnóstico do aparelho (conexão segura, suporte a push, app instalado, permissão, inscrição ativa), com uma frase dizendo o que fazer quando algo impede; **Ativar avisos neste aparelho**, que precisa de um toque porque o navegador só pede permissão a partir de um gesto; **Enviar um teste para mim**, limitado a 10 a cada 10 minutos; e a lista dos avisos recebidos. Tocar num aviso abre `/staging/avisos/:id`, com o texto completo.

**No dashboard, `/notificacoes`** (só admin, marcada "em teste" no menu) (o formulário, com a prévia do que aparece na tela bloqueada, e a lista dos envios: quantos na fila, enviados, exibidos, abertos, não saíram e cancelados. Cada envio abre por plataforma e por pessoa. O histórico registra quem agendou e cancelou, o tipo e quantas pessoas) **nunca o texto nem quem recebeu**.

---

## Os limites, e como medi-los

O push na web não se comporta igual em todo lugar. A tabela é o que se espera de cada situação; a última coluna se preenche com os números da tela de envios.

| Situação | Esperado | Medido |
|---|---|---|
| Android, Chrome, app instalado ou não | Chega | |
| Android, Samsung Internet | Chega | |
| iPhone/iPad no Safari, **aba comum** | **Não recebe**: o navegador não oferece push fora do app instalado | |
| iPhone/iPad **adicionado à Tela de Início** (iOS 16.4 ou mais novo) | Chega. A permissão só pode ser pedida de dentro do app instalado | |
| Navegador dentro de outro app (Instagram, Facebook, WhatsApp) | Não recebe: a tela orienta a abrir no Chrome ou no Safari | |
| Pelo IP da rede local (`http://`) | Não recebe: push exige HTTPS. O login funciona | |
| Economia de bateria, Android de algumas marcas | Atraso ou perda | |
| Permissão negada uma vez | O site não pode pedir de novo; só pelas configurações do navegador | |
| Dados do site apagados, app desinstalado | A inscrição morre; o despachante a remove no primeiro envio | |
| PC do Docker desligado | Nada sai; ao voltar, o que venceu vira `expirada` em vez de chegar atrasado | |

**Para medir:**

1. Em cada aparelho, pelo endereço **HTTPS** do chat: entrar em `/staging`, criar a conta, abrir **Avisos** e tocar em **Ativar avisos neste aparelho**. No iPhone, antes, adicionar à Tela de Início e abrir por lá.
2. Tocar em **Enviar um teste para mim** e conferir se chega. Isso valida o aparelho sozinho.
3. No dashboard, em `/notificacoes`, mandar um aviso para todas as contas.
4. Abrir o envio em **Por plataforma e por pessoa**. *Aceitas* × *Exibidas* por plataforma é a taxa de entrega real; *Abertas* mostra se alguém toca.
5. Repetir com o celular bloqueado, com economia de bateria ligada, e depois de algumas horas sem usar o app.

O user agent separa **"iOS · app na tela de início"** de "iOS · Safari", que é a distinção que mais importa. O iPad se anuncia como Mac desde o iPadOS 13 e aparece como Mac.

---

## Quando não chega

| Sintoma | Onde olhar |
|---|---|
| O diagnóstico em `/staging/avisos` aponta algo | A frase da tela já diz o que fazer |
| Aparece "Este site foi atualizado em segundo plano" no lugar do aviso | A inscrição está no service worker do `/`, que não tem código de aviso. Abrir `/staging/avisos` no aparelho corrige sozinho. Ver [armadilhas.md](armadilhas.md#contas-e-avisos-push) |
| O teste diz que o aviso chegou, mas o celular não mostrou | Notificações do Chrome, ou deste site, bloqueadas nas configurações do Android. "Testar só a tela deste aparelho" confirma |
| O teste diz que o aparelho não confirmou | O aviso não chegou ao Chrome: economia de bateria ou Chrome restrito em segundo plano |
| O teste não chega, e o envio mostra "nenhum aparelho com avisos ativados" | A inscrição foi removida, e a pessoa precisa ativar de novo |
| Fica "Na fila" para sempre | O relógio não está rodando: o PWA está na Vercel sem relógio externo, ou `PWA_DESPACHANTE=desligado`. Veja o log do container |
| "Aceita" mas não "Exibida" | O serviço entregou e o aparelho não mostrou, ou mostrou sem conseguir mandar o recibo (sem rede na hora). Economia de bateria é o suspeito habitual |
| Todos os aparelhos caíram de uma vez | As chaves VAPID mudaram. Ver o aviso acima |
| Chega atrasado ou não chega depois de um tempo desligado | Esperado: vencido é descartado. Aumente a validade no formulário |

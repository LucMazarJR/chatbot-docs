# Gatilhos de avisos

Um gatilho é uma regra que cria avisos sozinha: "quem tem consulta amanhã recebe um lembrete hoje à tarde", "quem ativou os avisos agora recebe uma confirmação". O painel continua sendo o lugar dos avisos que alguém da equipe escreve e manda. O gatilho é para o que acontece sempre do mesmo jeito, sem ninguém precisar lembrar.

O código fica em [pwa/src/gatilhos/](../pwa/src/gatilhos/). Os avisos que um gatilho cria entram na mesma fila do painel e saem pelo mesmo despachante (ver [notificacoes-push.md](notificacoes-push.md)). Por isso aparecem em **Avisos**, no painel, com as mesmas medidas de "apareceu" e "abriu", identificados como `Gatilho: <id>`.

---

## Ligar e desligar

Nada roda por padrão. Os gatilhos ligados são os listados em `GATILHOS_ATIVOS`, no `.env` da raiz, separados por vírgula:

```
GATILHOS_ATIVOS=boas-vindas,consulta-amanha
```

Depois de mudar a variável, recrie o container para ela valer:

```powershell
docker compose up -d pwa
```

Com `GATILHOS_ENSAIO=1`, os gatilhos ligados verificam e registram o que fariam, sem gravar nenhum aviso. É o jeito de ligar um gatilho novo pela primeira vez.

Os gatilhos rodam **só no Docker**, no mesmo relógio do despachante. Na Vercel não rodam, pelo mesmo motivo do despachante: lá a função congela entre requisições.

## Os gatilhos que existem

| Id | O que faz | De quanto em quanto tempo |
|---|---|---|
| `boas-vindas` | Avisa quem ativou os avisos pela primeira vez que eles funcionam naquele aparelho. Não manda para quem só trocou de celular, nem para quem já tinha ativado antes de o gatilho ser ligado (olha no máximo o último dia). | 5 minutos |

---

## Criar um gatilho

### 1. O arquivo

Um arquivo novo em `pwa/src/gatilhos/`, com o nome do id. Ele exporta o gatilho declarado com `definirGatilho`:

```ts
// pwa/src/gatilhos/consulta-amanha.ts
import { definirGatilho } from './tipos';

export default definirGatilho({
  id: 'consulta-amanha',
  descricao: 'Lembra na véspera quem tem consulta marcada.',
  aCadaMinutos: 60,
  tipo: 'lembrete-consulta',
  async verificar({ agora, db, ultimaExecucao }) {
    // ... descobre o que aconteceu e devolve os avisos a criar
    return [];
  },
});
```

| Campo | O que é |
|---|---|
| `id` | Minúsculas, números e hífen. É o que vai em `GATILHOS_ATIVOS`. |
| `descricao` | Uma frase. Aparece no registro e na tabela acima. |
| `aCadaMinutos` | De quanto em quanto tempo o executor chama `verificar`. |
| `tipo` | `lembrete-exame`, `lembrete-consulta` ou `aviso`. Define o título que aparece na tela bloqueada (ver [notificacoes-push.md](notificacoes-push.md#os-tipos-e-o-que-aparece-na-tela-bloqueada)). |
| `verificar` | Recebe `agora`, `db` (o banco do chat) e `ultimaExecucao`, e devolve a lista de avisos. |

### 2. Os avisos que `verificar` devolve

Cada item diz só o que muda de um aviso para outro. O documento completo da fila é montado pelo executor.

| Campo | Obrigatório | O que é |
|---|---|---|
| `usuarioId` | sim | A conta que recebe. Ela precisa ter os avisos ativados em algum aparelho, senão o aviso sai da fila como "não saiu". |
| `chave` | sim | O fato que gerou o aviso, único dentro do gatilho: `consulta-8841`. A mesma chave nunca gera dois avisos. |
| `detalhe` | sim | O texto que a pessoa lê dentro do chat. Até 1000 caracteres. |
| `validaAte` | sim | Depois disto o aviso é descartado em vez de chegar atrasado. |
| `enviarEm` | não | A partir de quando pode sair. Sem ele, sai na próxima rodada do despachante (até 30 segundos). |
| `mostrarDetalhe` | não | Mostrar o texto também na tela bloqueada. Falso por padrão. |

### 3. A lista

Uma linha em [pwa/src/gatilhos/index.ts](../pwa/src/gatilhos/index.ts):

```ts
import consultaAmanha from './consulta-amanha';

export const GATILHOS: Gatilho[] = [boasVindas, consultaAmanha];
```

Estar na lista não liga o gatilho. Ele só roda com o id em `GATILHOS_ATIVOS`.

### 4. Testar

1. `npm test` e `npx tsc --noEmit` em `pwa/`. Se o gatilho tem lógica própria (calcular a véspera, montar o texto), ela vai num teste ao lado, como [regras.test.ts](../pwa/src/gatilhos/regras.test.ts).
2. Ligue em ensaio: `GATILHOS_ATIVOS=consulta-amanha` e `GATILHOS_ENSAIO=1`, e recrie o container.
3. Confira o log: `docker compose logs pwa | Select-String gatilhos`. Cada rodada que teve algo a dizer escreve uma linha com quantos avisos foram propostos, quantos entrariam na fila, quantos já tinham sido mandados e quantos foram descartados.
4. Confira o registro no banco, em `pwa_prototipo.gatilhos_execucoes`: um documento por gatilho, com a última rodada e o motivo de cada descarte.
5. Tire o `GATILHOS_ENSAIO` e recrie o container. Os avisos aparecem em **Avisos**, no painel.

---

## Exemplo completo: lembrete de consulta vindo de uma agenda

Imagine que a agenda da unidade tenha um endereço que devolve as consultas de um dia em JSON, e que cada consulta traga o e-mail da pessoa. O gatilho abaixo lembra, a partir das 14h da véspera, quem tem consulta no dia seguinte.

```ts
// pwa/src/gatilhos/consulta-amanha.ts
import { definirGatilho } from './tipos';

type Consulta = { id: string; email: string; hora: string; unidade: string };

const HORA = 60 * 60 * 1000;

export default definirGatilho({
  id: 'consulta-amanha',
  descricao: 'Lembra na véspera, a partir das 14h, quem tem consulta marcada.',
  aCadaMinutos: 60,
  tipo: 'lembrete-consulta',
  async verificar({ agora, db }) {
    const url = process.env.AGENDA_URL;
    if (!url) return []; // sem a variável, o gatilho não faz nada

    // A véspera no calendário de Brasília, e não no do servidor (UTC).
    const hoje = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const horaAgora = Number(
      agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }),
    );
    if (horaAgora < 14) return [];
    const amanha = new Date(`${hoje}T12:00:00-03:00`).getTime() + 24 * HORA;
    const dia = new Date(amanha).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

    const resposta = await fetch(`${url}?dia=${dia}`, { signal: AbortSignal.timeout(15_000) });
    if (!resposta.ok) throw new Error(`agenda respondeu ${resposta.status}`);
    const consultas = (await resposta.json()) as Consulta[];

    // Da agenda para a conta do chat, pelo e-mail.
    const contas = await db
      .collection<{ _id: string; emailNormalizado: string }>('usuarios')
      .find({ emailNormalizado: { $in: consultas.map((c) => c.email.trim().toLowerCase()) } })
      .toArray();
    const contaDoEmail = new Map(contas.map((c) => [c.emailNormalizado, c._id]));

    return consultas.flatMap((consulta) => {
      const usuarioId = contaDoEmail.get(consulta.email.trim().toLowerCase());
      if (!usuarioId) return [];
      return [
        {
          usuarioId,
          chave: `consulta-${consulta.id}`,
          detalhe: `Sua consulta é amanhã, às ${consulta.hora}, na ${consulta.unidade}.`,
          // Vale até o horário da consulta: depois dele, o lembrete não serve mais.
          validaAte: new Date(`${dia}T${consulta.hora}:00-03:00`),
        },
      ];
    });
  },
});
```

O que o exemplo mostra:

- **Variável nova nasce vazia.** Sem `AGENDA_URL`, o gatilho devolve lista vazia, e o sistema funciona como antes. A variável entra no `docker-compose.yml` (serviço `pwa`) e no `.env.example`, com padrão vazio.
- **Rodar de hora em hora não repete o lembrete.** A chave `consulta-<id>` garante que cada consulta avisa uma vez só, mesmo aparecendo na agenda em várias verificações.
- **O fuso é o de Brasília.** O servidor roda em UTC: sem fixar o fuso, "amanhã" começaria às 21h.
- **Erro vira registro, não queda.** Um `throw` dentro de `verificar` fica registrado em `gatilhos_execucoes` e no log, só com a mensagem, e os outros gatilhos continuam rodando.

---

## O que o executor garante

Quem escreve um gatilho não precisa cuidar disto:

- **Formato da fila.** O documento é montado por `montarNotificacao`, no mesmo formato do painel. Campo com nome errado não dá erro: o aviso só fica parado na fila para sempre. Por isso o gatilho não monta o documento.
- **Não repetir.** Cada chave usada vira uma marca em `pwa_prototipo.gatilhos_disparos`, com o id único como trava. Uma chave repetida é contada como "repetido" e ignorada.
- **Teto por rodada.** No máximo 200 avisos por gatilho em cada rodada. O resto é descartado e registrado. Um gatilho com defeito (consulta sem filtro, data errada) não manda notificação para a base inteira.
- **Conferência.** Aviso sem validade, vencido, com texto vazio ou longo demais, ou com envio depois da validade, é descartado com o motivo.
- **Registro.** Cada rodada fica em `pwa_prototipo.gatilhos_execucoes`: quando, quantos avisos propostos, quantos na fila, quantos repetidos, os descartes com o motivo e o erro, se houve.
- **Exclusão.** Apagar a conta apaga também as marcas de disparo dela, junto com os avisos e as inscrições.

## Regras para escrever um gatilho

- **Nada de dado de saúde na chave.** Ela fica guardada enquanto a marca existir. `consulta-8841` sim, `consulta-cardiologia-joao` não.
- **Tela bloqueada discreta.** Deixe `mostrarDetalhe` desligado, a menos que o texto não diga nada sobre a saúde de ninguém. Desligado, a tela bloqueada mostra só o título do tipo ("Você tem um lembrete").
- **Sempre uma validade que faça sentido.** Lembrete de consulta vale até a consulta. Aviso sem prazo real vale, no máximo, alguns dias.
- **Olhe só o que é novo.** Use `ultimaExecucao` para não reprocessar a base inteira a cada volta, e limite a primeira execução a um período curto, como o `boas-vindas` faz. Sem isso, ligar o gatilho manda aviso sobre coisas antigas.
- **Conteúdo de cidadão não vai para o log.** Se precisar registrar algo, registre números e identificadores.

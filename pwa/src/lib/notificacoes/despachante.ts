import { randomBytes } from 'node:crypto';

import webpush from 'web-push';

import { inscricoesPush, notificacoes } from '@/lib/db';
import { chavesVapid } from '@/lib/push/vapid';
import {
  classificarResposta,
  decidir,
  esperaAntesDaTentativa,
  TENTATIVAS_MAXIMAS,
  TRAVA_MS,
  ttlEmSegundos,
} from './regras';
import { montarConteudo, TIPOS, type Entrega, type Notificacao } from './tipos';

/** Quanto tempo um aviso que saiu da fila continua no banco, para as estatísticas. */
const GUARDAR_DEPOIS_DE_SAIR_MS = 90 * 24 * 60 * 60 * 1000;

/** Teto por rodada: com uma fila enorme, a rodada termina e a próxima continua. */
const LIMITE_POR_RODADA = 100;

export type ResultadoDespacho = {
  reivindicadas: number;
  enviadas: number;
  expiradas: number;
  reagendadas: number;
  falharam: number;
  inscricoesRemovidas: number;
};

let rodadaEmAndamento: Promise<ResultadoDespacho> | null = null;

/**
 * Envia o que está vencido na fila.
 *
 * Seguro de chamar de vários lugares ao mesmo tempo. Dentro do mesmo processo,
 * quem chega durante uma rodada recebe o resultado dela em vez de abrir outra.
 * Entre processos diferentes — o Docker e um relógio externo, duas réplicas —,
 * quem garante é a reivindicação atômica: cada aviso só passa para `enviando`
 * uma vez.
 */
export function despachar(limite = LIMITE_POR_RODADA): Promise<ResultadoDespacho> {
  rodadaEmAndamento ??= rodar(limite).finally(() => {
    rodadaEmAndamento = null;
  });
  return rodadaEmAndamento;
}

async function rodar(limite: number): Promise<ResultadoDespacho> {
  const resultado: ResultadoDespacho = {
    reivindicadas: 0,
    enviadas: 0,
    expiradas: 0,
    reagendadas: 0,
    falharam: 0,
    inscricoesRemovidas: 0,
  };

  const col = await notificacoes();

  for (let i = 0; i < limite; i += 1) {
    const agora = new Date();

    // `enviando` com a trava vencida é aviso de uma rodada que morreu no meio
    // (o container reiniciou). Sem pegá-lo de volta, ele ficaria preso para
    // sempre. Pode sair duplicado se o envio chegou a acontecer — e a `tag` da
    // notificação faz o aparelho substituir em vez de mostrar duas.
    const aviso = await col.findOneAndUpdate(
      {
        estado: { $in: ['pendente', 'enviando'] },
        enviarEm: { $lte: agora },
        $or: [{ travadaAte: null }, { travadaAte: { $lte: agora } }],
      },
      { $set: { estado: 'enviando', travadaAte: new Date(agora.getTime() + TRAVA_MS) } },
      { sort: { enviarEm: 1 }, returnDocument: 'after' },
    );
    if (!aviso) break;

    resultado.reivindicadas += 1;
    try {
      await processar(aviso, resultado);
    } catch (erro) {
      // Um aviso com problema não pode travar a fila inteira. A trava vence em
      // dois minutos e ele volta a ser tentado.
      console.error(`[despachante] aviso ${aviso._id} falhou no processamento:`, erro);
    }
  }

  return resultado;
}

async function processar(aviso: Notificacao, resultado: ResultadoDespacho): Promise<void> {
  const col = await notificacoes();
  const agora = new Date();
  const saidaDaFila = { travadaAte: null, expiraEm: new Date(agora.getTime() + GUARDAR_DEPOIS_DE_SAIR_MS) };

  if (decidir(aviso.validaAte, agora) === 'expirar') {
    await col.updateOne(
      { _id: aviso._id },
      { $set: { estado: 'expirada', motivo: 'passou do prazo antes de sair', ...saidaDaFila } },
    );
    resultado.expiradas += 1;
    return;
  }

  const aparelhos = await (await inscricoesPush()).find({ usuarioId: aviso.usuarioId }).toArray();
  if (aparelhos.length === 0) {
    await col.updateOne(
      { _id: aviso._id },
      { $set: { estado: 'falhou', motivo: 'nenhum aparelho com avisos ativados', ...saidaDaFila } },
    );
    resultado.falharam += 1;
    return;
  }

  const recibo = aviso.recibo ?? randomBytes(16).toString('base64url');
  const conteudo = JSON.stringify(montarConteudo(aviso, recibo));
  const chaves = await chavesVapid();

  const entregas: Entrega[] = await Promise.all(
    aparelhos.map(async (aparelho) => {
      let codigo: number | null = null;
      try {
        const resposta = await webpush.sendNotification(
          { endpoint: aparelho.endpoint, keys: aparelho.chaves },
          conteudo,
          {
            vapidDetails: { subject: chaves.assunto, publicKey: chaves.publica, privateKey: chaves.privada },
            TTL: ttlEmSegundos(aviso.validaAte, agora),
            urgency: (TIPOS[aviso.tipo] ?? TIPOS.aviso).urgencia,
            timeout: 15_000,
          },
        );
        codigo = resposta.statusCode;
      } catch (erro) {
        // WebPushError traz o código do serviço; erro de rede não traz nenhum.
        const status = (erro as { statusCode?: unknown }).statusCode;
        codigo = typeof status === 'number' ? status : null;
      }

      return {
        inscricaoId: aparelho._id,
        resultado: classificarResposta(codigo),
        codigo,
        em: new Date(),
        userAgent: aparelho.userAgent,
        recebidaEm: null,
        exibidaEm: null,
        abertaEm: null,
      };
    }),
  );

  await atualizarAparelhos(entregas, resultado);

  const alguemRecebeu = entregas.some((e) => e.resultado === 'enviada');
  const vaiTentarDeNovo =
    !alguemRecebeu &&
    entregas.some((e) => e.resultado === 'tentar-de-novo') &&
    aviso.tentativas + 1 < TENTATIVAS_MAXIMAS;

  if (alguemRecebeu) {
    await col.updateOne(
      { _id: aviso._id },
      {
        $set: { estado: 'enviada', enviadaEm: new Date(), recibo, motivo: null, ...saidaDaFila },
        $inc: { tentativas: 1 },
        $push: { entregas: { $each: entregas } },
      },
    );
    resultado.enviadas += 1;
  } else if (vaiTentarDeNovo) {
    await col.updateOne(
      { _id: aviso._id },
      {
        $set: {
          estado: 'pendente',
          enviarEm: new Date(Date.now() + esperaAntesDaTentativa(aviso.tentativas + 1)),
          travadaAte: null,
          recibo,
          motivo: 'serviço de push indisponível; nova tentativa agendada',
        },
        $inc: { tentativas: 1 },
        $push: { entregas: { $each: entregas } },
      },
    );
    resultado.reagendadas += 1;
  } else {
    const codigos = entregas.map((e) => e.codigo ?? 'sem resposta').join(', ');
    await col.updateOne(
      { _id: aviso._id },
      {
        $set: { estado: 'falhou', recibo, motivo: `nenhum aparelho aceitou (${codigos})`, ...saidaDaFila },
        $inc: { tentativas: 1 },
        $push: { entregas: { $each: entregas } },
      },
    );
    resultado.falharam += 1;
  }
}

/**
 * Remove as inscrições mortas e marca o histórico das vivas.
 *
 * Remover é o que impede a fila de insistir para sempre num aparelho que
 * desinstalou o app: cada aviso futuro para aquela conta tentaria de novo e
 * receberia o mesmo 410.
 */
async function atualizarAparelhos(entregas: Entrega[], resultado: ResultadoDespacho): Promise<void> {
  const col = await inscricoesPush();

  const mortas = entregas.filter((e) => e.resultado === 'inscricao-morta').map((e) => e.inscricaoId);
  if (mortas.length > 0) {
    const removidas = await col.deleteMany({ _id: { $in: mortas } });
    resultado.inscricoesRemovidas += removidas.deletedCount;
  }

  const vivas = entregas.filter((e) => e.resultado === 'enviada').map((e) => e.inscricaoId);
  if (vivas.length > 0) {
    await col.updateMany(
      { _id: { $in: vivas } },
      { $set: { ultimoSucessoEm: new Date(), falhasSeguidas: 0 } },
    );
  }

  const instaveis = entregas
    .filter((e) => e.resultado === 'tentar-de-novo' || e.resultado === 'falhou')
    .map((e) => e.inscricaoId);
  if (instaveis.length > 0) {
    await col.updateMany({ _id: { $in: instaveis } }, { $inc: { falhasSeguidas: 1 } });
  }
}

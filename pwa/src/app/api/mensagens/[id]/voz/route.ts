import { mensagens } from '@/lib/db';
import { dentroDoLimite } from '@/lib/limite';
import { autenticarSessao, temDonoQueSeProva } from '@/lib/sessao-autenticada';
import { avisoDaFalha, falarComVozNatural, JANELA_POR_PESSOA_MS, voltaEmDaRecusa } from '@/lib/voz-ia';
import { vozDaLista } from '@/lib/vozes';

export const dynamic = 'force-dynamic';
// Uma resposta longa leva perto de 25 segundos para ser falada pelo Gemini.
export const maxDuration = 60;

type Contexto = { params: Promise<{ id: string }> };

const NAO_ENCONTRADA = () => Response.json({ erro: 'mensagem não encontrada' }, { status: 404 });

/**
 * A resposta do bot falada com voz natural, em MP3.
 *
 * Só a pessoa dona da conversa ouve: a conta, no staging, ou quem tem a chave
 * da conversa, no `/`. O texto falado é o que
 * está gravado na mensagem, e não um texto mandado pela tela: assim a rota não
 * vira um gerador de voz para qualquer coisa. O áudio não é guardado; a
 * mensagem registra o acionamento (modelo, voz, quando, quantos caracteres),
 * e o navegador guarda o MP3 por um dia, para tocar de novo sem nova chamada.
 */
export async function GET(requisicao: Request, { params }: Contexto) {
  const { id } = await params;
  const colecao = await mensagens();
  const mensagem = await colecao.findOne(
    { _id: id },
    { projection: { sessaoId: 1, papel: 1, texto: 1, pendente: 1, erro: 1 } },
  );
  if (!mensagem) return NAO_ENCONTRADA();

  const autenticada = await autenticarSessao(requisicao, mensagem.sessaoId);
  if ('erro' in autenticada || !temDonoQueSeProva(autenticada.sessao)) return NAO_ENCONTRADA();

  if (mensagem.papel !== 'bot' || mensagem.pendente || mensagem.erro || !mensagem.texto) {
    return Response.json({ erro: 'Esta mensagem não tem resposta para ouvir.' }, { status: 409 });
  }

  if (!(await dentroDoLimite(`voz:falar:${mensagem.sessaoId}`, { janelaMs: JANELA_POR_PESSOA_MS, maximo: 30 }))) {
    return Response.json(
      { erro: avisoDaFalha('pessoa'), falha: 'pessoa', voltaEm: voltaEmDaRecusa('pessoa')?.toISOString() },
      { status: 429 },
    );
  }

  const voz = vozDaLista(new URL(requisicao.url).searchParams.get('voz'));
  const resultado = await falarComVozNatural(mensagem.texto, voz);
  if (!resultado.ok) {
    if (resultado.falha !== 'longa') console.error('voz natural falhou', { falha: resultado.falha });
    return Response.json(
      { erro: avisoDaFalha(resultado.falha), falha: resultado.falha, voltaEm: voltaEmDaRecusa(resultado.falha)?.toISOString() },
      { status: resultado.falha === 'longa' ? 413 : 503 },
    );
  }

  // O registro não pode impedir a pessoa de ouvir: falhou, segue.
  await colecao
    .updateOne(
      { _id: id },
      { $set: { vozGerada: { modelo: resultado.modelo, voz, em: new Date(), caracteres: resultado.caracteres, ms: resultado.ms } } },
    )
    .catch(() => {});

  return new Response(new Blob([resultado.mp3], { type: 'audio/mpeg' }), {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400' },
  });
}

import { origemConfiavel } from '@/lib/conta/sessao';
import { dentroDoLimite, identificar } from '@/lib/limite';
import { autenticarSessao, temDonoQueSeProva } from '@/lib/sessao-autenticada';
import { avisoDaTranscricao, JANELA_POR_PESSOA_MS, transcrever, voltaEmDaRecusa } from '@/lib/voz-ia';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Um minuto de áudio: o teto da gravação. Em opus, que o Chrome grava, um
 * minuto fica perto de 500 KB; o limite de corpo da Vercel é 4,5 MB.
 */
const MAXIMO_BYTES = 2_500_000;

/** Áudios por pessoa a cada 10 minutos. */
const AUDIOS_POR_PESSOA = 20;

/**
 * Áudios por endereço a cada 10 minutos, na conversa sem conta. Quem não tem
 * conta pode abrir conversas novas para fugir do limite de cada uma; o
 * endereço é o mesmo. Folgado, porque um posto de saúde inteiro pode sair
 * pelo mesmo endereço.
 */
const AUDIOS_POR_ENDERECO = 60;

const recusaPorPessoa = () =>
  Response.json(
    { erro: avisoDaTranscricao('pessoa'), falha: 'pessoa', voltaEm: voltaEmDaRecusa('pessoa')?.toISOString() },
    { status: 429 },
  );

/**
 * O texto do áudio que a pessoa gravou.
 *
 * Só para quem prova ser dono de uma conversa aberta (`?sessao=`, com a conta
 * no staging ou a chave no `/`): uma rota aberta que chama o Gemini gastaria
 * a cota de qualquer um. O áudio passa pela memória da função até o Gemini e
 * some: não é gravado, e nada do que a pessoa disse vai para log. O texto
 * volta para a tela, que o manda como a pergunta, pelo caminho de sempre.
 */
export async function POST(requisicao: Request) {
  if (!origemConfiavel(requisicao)) {
    return Response.json({ erro: 'origem não permitida' }, { status: 403 });
  }

  const sessaoId = new URL(requisicao.url).searchParams.get('sessao');
  const autenticada = sessaoId ? await autenticarSessao(requisicao, sessaoId) : null;
  if (!autenticada || 'erro' in autenticada || !temDonoQueSeProva(autenticada.sessao) || autenticada.sessao.encerradaEm) {
    return Response.json(
      { erro: 'Não consegui receber o áudio desta conversa. Recarregue a página e grave de novo.' },
      { status: 401 },
    );
  }
  const { sessao } = autenticada;

  // Com conta, o limite é da pessoa, em qualquer aparelho; sem conta, da conversa.
  if (!(await dentroDoLimite(`voz:transcrever:${sessao.usuarioId ?? sessao._id}`, { janelaMs: JANELA_POR_PESSOA_MS, maximo: AUDIOS_POR_PESSOA }))) {
    return recusaPorPessoa();
  }
  if (
    !sessao.usuarioId &&
    !(await dentroDoLimite(`voz:transcrever:endereco:${identificar(requisicao)}`, { janelaMs: JANELA_POR_PESSOA_MS, maximo: AUDIOS_POR_ENDERECO }))
  ) {
    return recusaPorPessoa();
  }

  const formulario = await requisicao.formData().catch(() => null);
  const audio = formulario?.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ erro: 'O áudio não chegou. Grave de novo, ou escreva a sua dúvida.' }, { status: 400 });
  }
  if (audio.size > MAXIMO_BYTES) {
    return Response.json({ erro: 'O áudio ficou longo demais. Grave até um minuto, ou escreva a sua dúvida.' }, { status: 413 });
  }
  const mime = audio.type || 'audio/webm';
  if (!mime.startsWith('audio/')) {
    return Response.json({ erro: 'Este arquivo não é um áudio.' }, { status: 415 });
  }

  const resultado = await transcrever(new Uint8Array(await audio.arrayBuffer()), mime);
  if (!resultado.ok) {
    // Só o motivo, nunca o conteúdo.
    if (resultado.falha !== 'vazia') console.error('transcrição falhou', { falha: resultado.falha });
    // `voltaEm` só nas recusas do dia: com ele, a tela bloqueia a opção e diz
    // a hora em que volta, em vez de tentar de novo a cada áudio.
    return Response.json(
      { erro: avisoDaTranscricao(resultado.falha), falha: resultado.falha, voltaEm: voltaEmDaRecusa(resultado.falha)?.toISOString() },
      { status: resultado.falha === 'vazia' ? 422 : 503 },
    );
  }

  return Response.json({ texto: resultado.texto, modelo: resultado.modelo, ms: resultado.ms });
}

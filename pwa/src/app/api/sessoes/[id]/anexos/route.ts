import { randomUUID } from 'node:crypto';

import { mensagens } from '@/lib/db';
import { dentroDoLimite, identificar } from '@/lib/limite';
import { TEXTO_SOMENTE_TEXTO } from '@/lib/mensagens-fixas';
import { autenticarSessao } from '@/lib/sessao-autenticada';
import type { Mensagem, TipoAnexo } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

/**
 * Registra que alguém tentou mandar arquivo ou áudio, e responde que não dá.
 *
 * LÓGICA DO LUCIANO: o canal real só processa texto — nem o WhatsApp nem o
 * fluxo do n8n têm caminho para áudio ou imagem. Os botões existem no protótipo
 * justamente por isso: a pergunta que a validação precisa responder é "quanta
 * gente tenta mandar foto do exame ou áudio em vez de digitar?", e essa resposta
 * só aparece se houver o botão para tentar. Sem eles, a ausência de tentativas
 * não provaria nada.
 *
 * O CONTEÚDO NÃO SOBE. Nada do arquivo ou do áudio sai do aparelho: vão só o
 * tipo, o tamanho e a duração. Guardar a gravação seria acumular voz de pessoas
 * relatando problema de saúde — dado sensível, sem nenhum uso possível, já que
 * não existe transcrição no fluxo. E o nome do arquivo fica de fora de
 * propósito: "exame_maria_silva.pdf" é exatamente o tipo de dado pessoal que o
 * aviso de consentimento pede para ninguém mandar.
 *
 * Não passa pelo n8n, então não gasta cota nem tempo de fila: a recusa é
 * imediata e igual à que o canal real daria.
 */
export async function POST(requisicao: Request, { params }: Contexto) {
  const { id } = await params;

  const corpo = (await requisicao.json().catch(() => ({}))) as {
    tipo?: string;
    mime?: string;
    tamanhoBytes?: number;
    duracaoSegundos?: number;
  };

  const tipo = corpo.tipo === 'audio' ? 'audio' : corpo.tipo === 'arquivo' ? 'arquivo' : null;
  if (!tipo) return Response.json({ erro: 'tipo inválido' }, { status: 400 });

  if (!(await dentroDoLimite(identificar(requisicao)))) {
    return Response.json(
      { erro: 'muitas mensagens em pouco tempo, aguarde alguns minutos' },
      { status: 429 },
    );
  }

  const autenticada = await autenticarSessao(requisicao, id);
  if ('erro' in autenticada) return autenticada.erro;
  const { sessao } = autenticada;

  if (sessao.encerradaEm) return Response.json({ erro: 'sessão já encerrada' }, { status: 409 });

  const colMensagens = await mensagens();
  const correlationId = randomUUID();
  const agora = new Date();

  // O texto é o mesmo que aparece no balão da pessoa. Guardar uma descrição
  // legível, em vez de só um campo `tipo`, é o que mantém a transcrição do
  // painel compreensível sem que ele precise saber destes tipos novos.
  const texto = descrever(tipo, corpo.tamanhoBytes, corpo.duracaoSegundos);

  const envio: Mensagem = {
    _id: randomUUID(),
    sessaoId: sessao._id,
    papel: 'user',
    texto,
    em: agora,
    correlationId,
    tipo,
    anexo: {
      mime: typeof corpo.mime === 'string' ? corpo.mime.slice(0, 100) : undefined,
      tamanhoBytes: numeroFinito(corpo.tamanhoBytes),
      duracaoSegundos: numeroFinito(corpo.duracaoSegundos),
    },
  };

  const recusa: Mensagem = {
    _id: randomUUID(),
    sessaoId: sessao._id,
    papel: 'bot',
    texto: TEXTO_SOMENTE_TEXTO,
    em: new Date(),
    correlationId,
    // Não é erro nem lacuna de conteúdo: é o comportamento correto do canal.
    // Marcar como erro contaminaria a taxa de falha, e marcar como semResposta
    // mandaria "mandei um áudio" para a fila de curadoria virar FAQ.
    erro: false,
    semResposta: false,
    // Sem polegar: não há o que avaliar numa recusa fixa.
    feedback: null,
  };

  await colMensagens.insertMany([envio, recusa]);

  return Response.json(
    { mensagemId: envio._id, texto, resposta: TEXTO_SOMENTE_TEXTO },
    { status: 201 },
  );
}

function numeroFinito(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : undefined;
}

function descrever(tipo: TipoAnexo, tamanhoBytes?: number, duracaoSegundos?: number): string {
  if (tipo === 'audio') {
    const segundos = Math.round(numeroFinito(duracaoSegundos) ?? 0);
    const minutos = Math.floor(segundos / 60);
    return `🎤 Áudio (${minutos}:${String(segundos % 60).padStart(2, '0')})`;
  }

  const bytes = numeroFinito(tamanhoBytes);
  return bytes === undefined ? '📎 Arquivo' : `📎 Arquivo (${formatarTamanho(bytes)})`;
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

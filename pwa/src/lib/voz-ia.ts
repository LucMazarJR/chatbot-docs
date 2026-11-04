import { createHash } from 'node:crypto';

import { limites } from './db';
import { dentroDoLimite } from './limite';
import { lerPcmDoGemini, paraMp3 } from './audio-mp3';
import { textoParaFala } from './texto-para-fala';
import type { NomeDaVoz } from './vozes';

/**
 * A voz por IA do staging: transcrever o áudio da pessoa e falar a resposta
 * com voz natural, pelo Gemini.
 *
 * LÓGICA DO LUCIANO: o orçamento é zero. As chaves (`GEMINI_VOZ_API_KEY`, uma
 * ou mais, separadas por vírgula) são de projetos do Google sem cobrança, e há
 * um teto diário próprio (`VOZ_IA_LIMITE_DIA`). No plano gratuito, a fala tem
 * só 10 chamadas por dia por modelo e por projeto (a transcrição, 500): por
 * isso a fala tenta cada modelo em cada chave antes de desistir, e a
 * combinação que recebe a recusa do dia fica marcada até a virada. Sem
 * nenhuma combinação com cota, a resposta é lida pela voz do celular, e a tela
 * diz isso. Nada aqui grava áudio nem escreve em log o que a pessoa disse.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

function lista(valor: string | undefined, padrao: string[]): string[] {
  const itens = (valor ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return itens.length ? itens : padrao;
}

/** Na ordem de preferência; o segundo entra quando o primeiro está sobrecarregado ou sem cota. */
export const MODELOS_DE_TRANSCRICAO = () =>
  lista(process.env.VOZ_IA_MODELO_TRANSCRICAO, ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']);

/** Na ordem de preferência: o lite primeiro, por ser o mais rápido. */
export const MODELOS_DE_FALA = () =>
  lista(process.env.VOZ_IA_MODELO_FALA, ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']);

export function chavesDaVozIa(): string[] {
  return lista(process.env.GEMINI_VOZ_API_KEY, []);
}

/**
 * Teto próprio de chamadas de voz por IA por dia, somando transcrições e
 * falas. Fica acima da soma das cotas de fala de duas chaves (40) porque as
 * transcrições também contam, e abaixo do que um uso descontrolado gastaria.
 */
const LIMITE_PADRAO = 120;

/**
 * Até onde a voz natural fala uma resposta numa chamada. A resposta mais
 * longa medida (cerca de 1.650 caracteres) leva perto de 25 segundos para ser
 * gerada e dá 2,5 minutos de fala; acima disso, a voz do celular lê.
 */
export const MAXIMO_DE_CARACTERES = 1800;

export type Indisponivel = 'sem-chave' | 'esgotada';
export type Falha = 'cota' | 'minuto' | 'falha' | 'vazia';
/** Qualquer recusa que chega à tela. `pessoa`: o limite de cada conta ou conversa. */
export type Recusa = Falha | Indisponivel | 'longa' | 'pessoa';

/** A janela do limite de cada pessoa (transcrições por conta, falas por conversa). */
export const JANELA_POR_PESSOA_MS = 10 * 60 * 1000;

function limiteDoDia(): number {
  const valor = Number(process.env.VOZ_IA_LIMITE_DIA);
  return Number.isFinite(valor) && valor > 0 ? valor : LIMITE_PADRAO;
}

/**
 * O dia da cota, no horário do Pacífico: é quando o Google zera a cota
 * gratuita (4h ou 5h em Brasília). Contar no dia de Brasília deixaria a voz
 * desligada por horas depois de a cota já ter voltado.
 */
export function diaDaCota(agora: Date = new Date()): string {
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

/**
 * Quando a cota do Google volta: a próxima meia-noite do Pacífico.
 *
 * Ela cai às 7h ou às 8h UTC, conforme o horário de verão de lá, e por isso é
 * procurada hora a hora, e não somada a um fuso fixo, que erraria por uma hora
 * metade do ano.
 */
export function proximaViradaDaCota(agora: Date = new Date()): Date {
  const hoje = diaDaCota(agora);
  const [ano, mes, dia] = hoje.split('-').map(Number);
  for (let hora = 0; hora < 36; hora++) {
    const candidato = new Date(Date.UTC(ano, mes - 1, dia + 1, hora));
    if (diaDaCota(candidato) !== hoje) return candidato;
  }
  return new Date(agora.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Até quando a recusa vale, para a tela bloquear a opção e dizer quando volta.
 *
 * Só a cota do dia (a do Google ou o nosso teto) e o limite de cada pessoa
 * bloqueiam. A recusa do minuto passa em segundos: bloquear por ela tiraria a
 * voz natural de todo mundo por causa de um pico.
 */
export function voltaEmDaRecusa(recusa: Recusa, agora: Date = new Date()): Date | null {
  if (recusa === 'esgotada' || recusa === 'cota') return proximaViradaDaCota(agora);
  if (recusa === 'pessoa') return new Date(agora.getTime() + JANELA_POR_PESSOA_MS);
  return null;
}

/** Um apelido da chave para a marca no banco: a chave em si nunca é gravada. */
const apelido = (chave: string) => createHash('sha256').update(chave).digest('hex').slice(0, 10);
const prefixoDoDia = () => `voz-ia-esgotada:${diaDaCota()}:`;
const marcaDe = (chave: string, modelo: string) => `${prefixoDoDia()}${apelido(chave)}:${modelo}`;
const contagemDoDia = () => `voz-ia:${diaDaCota()}`;

type Combinacao = { chave: string; modelo: string };

/** As combinações de chave e modelo que ainda têm cota hoje, na ordem de preferência. */
async function combinacoes(modelos: string[]): Promise<Combinacao[]> {
  const todas = modelos.flatMap((modelo) => chavesDaVozIa().map((chave) => ({ chave, modelo })));
  try {
    const marcadas = await (await limites())
      .find({ _id: { $regex: `^${prefixoDoDia().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }, { projection: { _id: 1 } })
      .toArray();
    const fora = new Set(marcadas.map((marca) => marca._id));
    return todas.filter((c) => !fora.has(marcaDe(c.chave, c.modelo)));
  } catch {
    // Sem o banco, tenta todas: quem decide é a resposta do Google.
    return todas;
  }
}

async function marcarEsgotada({ chave, modelo }: Combinacao): Promise<void> {
  try {
    await (await limites()).updateOne(
      { _id: marcaDe(chave, modelo) },
      { $set: { marcas: [new Date()], expiraEm: new Date(Date.now() + 26 * 60 * 60 * 1000) } },
      { upsert: true },
    );
  } catch {
    // Sem a marca, a próxima chamada recebe a recusa de novo e tenta marcar.
  }
}

/** O teto próprio do dia já foi atingido? Só lê. */
async function tetoAtingido(): Promise<boolean> {
  try {
    const registro = await (await limites()).findOne({ _id: contagemDoDia() });
    return (registro?.marcas?.length ?? 0) >= limiteDoDia();
  } catch {
    return false;
  }
}

/**
 * O que a tela pode oferecer agora. Só lê: não gasta cota nem teto.
 *
 * `audio`: mandar pergunta em áudio (depende da transcrição).
 * `vozNatural`: ouvir a resposta com voz natural. Sem ela, o áudio continua, e
 * a resposta é lida pela voz do celular.
 */
export async function situacaoDaVozIa(): Promise<{
  audio: boolean;
  vozNatural: boolean;
  motivo?: Indisponivel;
  /** Quando a parte esgotada volta, para a tela dizer a hora. */
  voltaEm?: string;
}> {
  if (!chavesDaVozIa().length) return { audio: false, vozNatural: false, motivo: 'sem-chave' };
  const voltaEm = proximaViradaDaCota().toISOString();
  if (await tetoAtingido()) return { audio: false, vozNatural: false, motivo: 'esgotada', voltaEm };
  const [paraOuvir, paraFalar] = await Promise.all([
    combinacoes(MODELOS_DE_TRANSCRICAO()),
    combinacoes(MODELOS_DE_FALA()),
  ]);
  const situacao = { audio: paraOuvir.length > 0, vozNatural: paraFalar.length > 0 };
  return situacao.audio && situacao.vozNatural ? situacao : { ...situacao, motivo: 'esgotada', voltaEm };
}

/** Conta uma chamada no teto próprio do dia. */
async function reservarChamada(): Promise<boolean> {
  return dentroDoLimite(contagemDoDia(), { janelaMs: 26 * 60 * 60 * 1000, maximo: limiteDoDia() });
}

/**
 * O 429 foi da cota do dia, e não da do minuto?
 *
 * LÓGICA DO LUCIANO: a fala tem limite por minuto baixo no plano gratuito, e
 * um 429 de minuto passa em segundos. Tratar todo 429 como "acabou por hoje"
 * desligava a voz natural o dia inteiro depois de um pico de uso. Só a
 * violação com "PerDay" no id da cota marca o dia como esgotado.
 */
export function cotaDoDia(corpo: unknown): boolean {
  const detalhes = (corpo as { error?: { details?: { violations?: { quotaId?: string }[] }[] } } | null)?.error?.details ?? [];
  return detalhes.some((detalhe) => (detalhe.violations ?? []).some((v) => /PerDay/i.test(v.quotaId ?? '')));
}

type Resultado = { ok: true; dados: unknown; modelo: string } | { ok: false; falha: Falha };

/**
 * Tenta cada combinação de chave e modelo, na ordem, dentro de um prazo total.
 *
 * Recusa por cota passa para a próxima combinação: cada chave e cada modelo
 * têm cota própria. Sobrecarga (5xx) ou demora passa para o próximo MODELO:
 * o mesmo modelo por outra chave estaria igualmente sobrecarregado. Erro de
 * pedido (4xx) para na hora, porque nenhuma outra combinação o resolveria.
 * O prazo é do conjunto, e não de cada tentativa, para a função não passar do
 * tempo máximo da plataforma.
 */
async function chamarGemini(lista: Combinacao[], corpo: unknown, prazoTotalMs: number): Promise<Resultado> {
  const fim = Date.now() + prazoTotalMs;
  const sobrecarregados = new Set<string>();
  let viuMinuto = false;
  let viuSobrecarga = false;

  for (const combinacao of lista) {
    if (sobrecarregados.has(combinacao.modelo)) continue;
    const restante = fim - Date.now();
    if (restante < 3000) break;
    try {
      const resposta = await fetch(`${API}/${combinacao.modelo}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': combinacao.chave },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(restante),
        cache: 'no-store',
      });
      if (resposta.status === 429) {
        const doDia = cotaDoDia(await resposta.json().catch(() => null));
        console.error('Gemini recusou a voz por IA por cota', { modelo: combinacao.modelo, doDia });
        if (doDia) await marcarEsgotada(combinacao);
        else viuMinuto = true;
        continue;
      }
      if (resposta.status >= 500) {
        console.error('Gemini sobrecarregado na voz por IA', { modelo: combinacao.modelo, status: resposta.status });
        sobrecarregados.add(combinacao.modelo);
        viuSobrecarga = true;
        continue;
      }
      if (!resposta.ok) {
        // O código e o modelo dizem o que consertar; o corpo da resposta pode
        // repetir o pedido, e por isso fica fora do log.
        console.error('Gemini recusou a voz por IA', { modelo: combinacao.modelo, status: resposta.status });
        return { ok: false, falha: 'falha' };
      }
      return { ok: true, dados: await resposta.json(), modelo: combinacao.modelo };
    } catch (erro) {
      console.error('Gemini não respondeu à voz por IA', {
        modelo: combinacao.modelo,
        erro: erro instanceof Error ? erro.name : 'desconhecido',
      });
      sobrecarregados.add(combinacao.modelo);
      viuSobrecarga = true;
    }
  }
  return { ok: false, falha: viuSobrecarga ? 'falha' : viuMinuto ? 'minuto' : 'cota' };
}

type PartesDoGemini = { candidates?: { content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] } }[] };

const PROMPT_DE_TRANSCRICAO =
  'Transcreva o áudio palavra por palavra, em português do Brasil. Mantenha as siglas como foram ditas ' +
  '(UBS, UPA, NGA, CAPS, SUS) e os nomes de remédios, exames e lugares. Não responda à pergunta e não ' +
  'acrescente nada: devolva só o texto falado. Se não houver fala, devolva uma resposta vazia.';

export type Transcricao =
  | { ok: true; texto: string; modelo: string; ms: number }
  | { ok: false; falha: Falha | Indisponivel };

/** O texto falado no áudio. O áudio não é guardado nem registrado. */
export async function transcrever(audio: Uint8Array, mime: string): Promise<Transcricao> {
  if (!chavesDaVozIa().length) return { ok: false, falha: 'sem-chave' };
  const lista = await combinacoes(MODELOS_DE_TRANSCRICAO());
  if (!lista.length || !(await reservarChamada())) return { ok: false, falha: 'esgotada' };

  const inicio = Date.now();
  const resultado = await chamarGemini(
    lista,
    {
      contents: [
        {
          parts: [
            { text: PROMPT_DE_TRANSCRICAO },
            { inlineData: { mimeType: mime.split(';')[0], data: Buffer.from(audio).toString('base64') } },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    },
    // Prazo do conjunto de tentativas. A transcrição varia muito no plano
    // gratuito (o mesmo áudio levou 2 s e, minutos depois, 16 s), e a rota tem
    // 60 s no total.
    50_000,
  );
  if (!resultado.ok) return { ok: false, falha: resultado.falha };

  const texto = ((resultado.dados as PartesDoGemini).candidates?.[0]?.content?.parts ?? [])
    .map((parte) => parte.text ?? '')
    .join('')
    .trim()
    .slice(0, 1000);
  if (!texto) return { ok: false, falha: 'vazia' };
  return { ok: true, texto, modelo: resultado.modelo, ms: Date.now() - inicio };
}

export type Fala =
  | { ok: true; mp3: Uint8Array<ArrayBuffer>; modelo: string; ms: number; caracteres: number }
  | { ok: false; falha: Falha | Indisponivel | 'longa' };

/**
 * A resposta falada com voz natural, em MP3.
 *
 * Vai só o texto, sem instrução de estilo: os modelos de fala testados leem a
 * instrução em voz alta junto com a resposta ("Leia com voz calma: ..."), em
 * português ou em inglês. A calma vem da voz escolhida e da velocidade, que o
 * navegador aplica na hora de tocar.
 */
export async function falarComVozNatural(texto: string, voz: NomeDaVoz): Promise<Fala> {
  const falado = textoParaFala(texto);
  if (!falado) return { ok: false, falha: 'vazia' };
  if (falado.length > MAXIMO_DE_CARACTERES) return { ok: false, falha: 'longa' };
  if (!chavesDaVozIa().length) return { ok: false, falha: 'sem-chave' };

  const lista = await combinacoes(MODELOS_DE_FALA());
  if (!lista.length || !(await reservarChamada())) return { ok: false, falha: 'esgotada' };

  const inicio = Date.now();
  const resultado = await chamarGemini(
    lista,
    {
      contents: [{ parts: [{ text: falado }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
      },
    },
    50_000,
  );
  if (!resultado.ok) return { ok: false, falha: resultado.falha };

  const audio = (resultado.dados as PartesDoGemini).candidates?.[0]?.content?.parts?.find((parte) => parte.inlineData)?.inlineData;
  if (!audio?.data) return { ok: false, falha: 'vazia' };

  const pcm = lerPcmDoGemini(new Uint8Array(Buffer.from(audio.data, 'base64')), audio.mimeType);
  if (!pcm.amostras.length) return { ok: false, falha: 'vazia' };
  return { ok: true, mp3: paraMp3(pcm), modelo: resultado.modelo, ms: Date.now() - inicio, caracteres: falado.length };
}

/** A frase que a tela mostra quando a transcrição do áudio não deu certo. */
export function avisoDaTranscricao(falha: Recusa): string {
  if (falha === 'vazia') return 'Não ouvi nenhuma fala no áudio. Toque no microfone e fale de novo, ou escreva a sua dúvida.';
  if (falha === 'esgotada' || falha === 'cota') {
    return 'A IA que entende áudio acabou por hoje. Até ela voltar, toque no microfone e fale: o celular escreve a pergunta no campo.';
  }
  if (falha === 'pessoa') {
    return 'Você mandou muitos áudios seguidos. Por alguns minutos, toque no microfone e fale: o celular escreve a pergunta no campo.';
  }
  if (falha === 'sem-chave') {
    return 'A IA que entende áudio não está ligada neste ambiente. Toque no microfone e fale: o celular escreve a pergunta no campo.';
  }
  if (falha === 'minuto') return 'Muita gente usando a voz agora. Grave de novo daqui a um minuto, ou escreva a sua dúvida.';
  return 'Não consegui entender o áudio agora. Tente de novo, ou escreva a sua dúvida.';
}

/** A frase que a tela mostra quando a voz natural não pôde falar a resposta. */
export function avisoDaFalha(falha: Recusa): string {
  if (falha === 'esgotada' || falha === 'cota') {
    return 'As vozes naturais acabaram por hoje. Até elas voltarem, leio as respostas com a voz do celular.';
  }
  if (falha === 'pessoa') return 'Você ouviu muitas respostas seguidas. Por alguns minutos, leio com a voz do celular.';
  if (falha === 'sem-chave') return 'A voz natural não está ligada neste ambiente. Uso a voz do celular.';
  if (falha === 'longa') return 'Esta resposta é longa para a voz natural. Uso a voz do celular.';
  if (falha === 'minuto') return 'Muita gente usando a voz natural agora. Desta vez, uso a voz do celular.';
  return 'Não consegui gerar a voz natural agora. Uso a voz do celular.';
}

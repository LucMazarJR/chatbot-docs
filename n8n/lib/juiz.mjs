// O veredito de cada turno, contra o gabarito.
//
// "Teve resposta" não quer dizer "acertou": há respostas montadas com a FAQ de
// outro exame ou de outra unidade. Por isso cada parte da pergunta é conferida
// contra a FAQ esperada. A resposta de texto livre não diz de qual FAQ saiu,
// então um modelo compara a resposta com a FAQ esperada e com os trechos que o
// chat recebeu. Temperatura 0 e resultado no cache: a mesma resposta recebe
// sempre o mesmo veredito, e o que muda entre rodadas é só a resposta.
//
// O juiz vê os trechos porque informação a mais não é erro quando vem da base
// e trata do mesmo assunto: a resposta sobre a endoscopia que soma os critérios
// de outra FAQ da endoscopia está certa. Erro é a informação de outro assunto,
// a que contradiz a FAQ e a que não está em trecho nenhum.
//
// Toda resposta passa pelo juiz, inclusive a que começa com "não encontrei":
// "não encontrei as linhas de ônibus, mas o endereço é..." respondeu a pergunta.
import { ObjectIdDe } from './busca.mjs';
import { CotaEsgotada, textoDaResposta } from './gemini.mjs';

// A mesma regex do PWA (pwa/src/app/api/n8n/resposta/route.ts), que decide o
// que vai para a curadoria quando o fluxo não manda as partes. O travessão é o
// do texto fixo do agente.
export const RE_NAO_ENCONTREI = /^\s*desculpe\s*[—–-]\s*n[ãa]o encontrei/i;

export const VEREDITOS = [
  'certa',
  'nao_encontrei_correto',
  'parcial',
  'faq_errada',
  'nao_encontrei_indevido',
  'inventou',
  'omitida',
  'falha',
];

// A FAQ esperada entra inteira até aqui: cortar antes fazia o juiz achar que o
// fim dela (as orientações depois da endoscopia, por exemplo) não existia.
const MAXIMO_DA_FAQ = 6000;

const PROMPT = [
  'Você confere as respostas de um chatbot de saúde pública. O chatbot só pode responder com o',
  'que está nos trechos das FAQs oficiais que ele recebeu.',
  '',
  'Você recebe a conversa até aqui, a pergunta nova do cidadão, as partes dessa pergunta com a',
  'FAQ oficial que responde cada uma (ou o aviso de que a base não tem essa informação), os',
  'trechos que o chatbot recebeu e a resposta que ele deu.',
  '',
  'Para cada parte, classifique a resposta do chatbot:',
  '- "certa": traz a informação essencial de uma das FAQs indicadas para a parte, sem contradizer.',
  '  Informação a mais é aceitável quando vem dos trechos recebidos e trata do mesmo assunto da',
  '  parte. Dizer que não encontrou um detalhe e mesmo assim trazer a informação essencial da FAQ',
  '  indicada também é "certa".',
  '- "errada": a informação principal da resposta para a parte vem de outro assunto (outro exame,',
  '  outra unidade, outro remédio, outro serviço), contradiz a FAQ indicada ou não está em nenhum',
  '  trecho recebido.',
  '- "nao_encontrou": diz que não encontrou a informação dessa parte, sem trazer a informação da',
  '  FAQ indicada.',
  '- "omitida": não trata dessa parte.',
  'Numa parte que a base não tem: "nao_encontrou" se a resposta avisa que não encontrou;',
  '"errada" se afirma alguma coisa sobre ela que não está nos trechos ou que vem de outro',
  'assunto; "omitida" se nem a menciona.',
  '',
  'Não julgue estilo, tamanho nem formatação.',
].join('\n');

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    partes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          parte: { type: 'INTEGER' },
          resultado: { type: 'STRING', enum: ['certa', 'errada', 'nao_encontrou', 'omitida'] },
          motivo: { type: 'STRING' },
        },
        required: ['parte', 'resultado', 'motivo'],
      },
    },
  },
  required: ['partes'],
};

export function criarJuiz({ cliente, modelo, cache, faqs }) {
  const faqsLidas = new Map();

  async function lerFaqs(ids) {
    const faltam = ids.filter((id) => !faqsLidas.has(id));
    if (faltam.length) {
      const docs = await faqs
        .find({ _id: { $in: faltam.map(ObjectIdDe) } }, { projection: { question: 1, answer: 1, category: 1, isActive: 1 } })
        .toArray();
      for (const d of docs) faqsLidas.set(String(d._id), d);
    }
    return ids.map((id) => faqsLidas.get(id)).filter(Boolean);
  }

  async function julgar({ historico, texto, partes, resposta, contextoLido }) {
    const blocos = [];
    for (const [i, parte] of partes.entries()) {
      const titulo = `Parte ${i + 1}: ${parte.descricao || (partes.length === 1 ? 'a pergunta inteira' : 'veja a pergunta')}`;
      if (!parte.faqs.length) {
        blocos.push(`${titulo}\n  A base não tem essa informação.`);
        continue;
      }
      const docs = await lerFaqs(parte.faqs);
      const textos = docs.map(
        (d) =>
          `  FAQ oficial:\n    Assunto: ${d.category ?? ''}\n    Pergunta: ${d.question ?? ''}\n    Resposta: ${String(d.answer ?? '').slice(0, MAXIMO_DA_FAQ)}`,
      );
      blocos.push(`${titulo}\n${textos.join('\n')}`);
    }
    const conversa = historico.length
      ? historico.map((m) => `${m.papel === 'user' ? 'Cidadão' : 'Assistente'}: ${m.texto.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n')
      : 'nenhuma';
    const corpo = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                PROMPT,
                '',
                `Conversa até aqui:\n${conversa}`,
                '',
                `Pergunta nova do cidadão:\n${texto}`,
                '',
                blocos.join('\n\n'),
                '',
                `Trechos que o chatbot recebeu:\n${contextoLido || 'nenhum.'}`,
                '',
                `Resposta do chatbot:\n${resposta}`,
              ].join('\n'),
            },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: ESQUEMA },
    };
    const r = await cache.ou('juiz', { modelo, corpo }, async () => {
      const { dados, ms } = await cliente.gerar(modelo, corpo);
      return { lido: JSON.parse(textoDaResposta(dados)), ms };
    });
    return r.lido.partes ?? [];
  }

  /**
   * O veredito de um turno com gabarito: o do turno, o de cada parte, as notas
   * para o relatório e se a resposta foi para a curadoria quando devia.
   */
  async function avaliar({ gabarito, historico, texto, resultado }) {
    if (!resultado.resposta) return { veredito: 'falha', partes: [], notas: resultado.falhas, lacuna: null };

    if (gabarito.tipo === 'saudacao') {
      const naoEncontrei = RE_NAO_ENCONTREI.test(resultado.resposta);
      return { veredito: naoEncontrei ? 'nao_encontrei_indevido' : 'certa', partes: [], notas: [], lacuna: null };
    }

    const partes = gabarito.partes;
    const notas = [];
    let julgadas;
    try {
      julgadas = await julgar({ historico, texto, partes, resposta: resultado.resposta, contextoLido: resultado.contextoLido });
    } catch (erro) {
      if (erro instanceof CotaEsgotada) throw erro;
      return { veredito: 'falha', partes: [], notas: [`juiz: ${erro.message}`], lacuna: null };
    }
    const porParte = partes.map((p, i) => {
      const j = julgadas.find((x) => x.parte === i + 1);
      if (!j) return 'omitida';
      if (j.motivo) notas.push(`parte ${i + 1}: ${j.resultado} (${j.motivo})`);
      if (p.faqs.length) {
        return { certa: 'certa', errada: 'faq_errada', nao_encontrou: 'nao_encontrei_indevido', omitida: 'omitida' }[j.resultado];
      }
      // "certa" numa parte sem FAQ quer dizer que o chat respondeu com algo
      // da base: ou o gabarito errou, ou ele usou uma FAQ de outro assunto.
      if (j.resultado === 'certa') notas.push(`parte ${i + 1}: o gabarito diz que a base não tem; conferir`);
      return { certa: 'inventou', errada: 'inventou', nao_encontrou: 'nao_encontrei_correto', omitida: 'omitida' }[j.resultado];
    });
    return { veredito: vereditoDoTurno(porParte), partes: porParte, notas, lacuna: lacunaDoTurno(partes, resultado) };
  }

  return { avaliar };
}

/**
 * Se o turno foi para a curadoria quando devia. Esperada: alguma parte que a
 * base não tem. Marcada: o que o PWA faria com a resposta, pelas partes que o
 * fluxo declara ou, sem elas, pelo texto de "não encontrei".
 */
export function lacunaDoTurno(partesDoGabarito, resultado) {
  const esperada = partesDoGabarito.some((p) => !p.faqs.length);
  const marcada = Array.isArray(resultado.partes) && resultado.partes.length
    ? resultado.partes.some((p) => !p.respondida)
    : RE_NAO_ENCONTREI.test(resultado.resposta ?? '');
  return { esperada, marcada };
}

/** Junta os vereditos das partes num veredito do turno. */
export function vereditoDoTurno(porParte) {
  const ok = (v) => v === 'certa' || v === 'nao_encontrei_correto';
  if (porParte.length && porParte.every(ok)) return porParte.includes('certa') ? 'certa' : 'nao_encontrei_correto';
  if (porParte.some(ok)) return 'parcial';
  for (const pior of ['inventou', 'faq_errada', 'nao_encontrei_indevido', 'omitida']) {
    if (porParte.includes(pior)) return pior;
  }
  return 'falha';
}

/** Quanto vale cada veredito na comparação entre fluxos: maior é melhor. */
export const pesoDoVeredito = (v) =>
  ({ certa: 3, nao_encontrei_correto: 3, parcial: 2, nao_encontrei_indevido: 1, omitida: 1, faq_errada: 0, inventou: 0, falha: 0 })[v] ?? 0;

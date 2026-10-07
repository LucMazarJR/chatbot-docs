// O veredito de cada turno, contra o gabarito.
//
// "Teve resposta" não quer dizer "acertou": há respostas montadas com a FAQ de
// outro exame ou de outra unidade. Por isso cada parte da pergunta é conferida
// contra a FAQ esperada. A resposta de texto livre (o `/` e o staging com
// agente) não diz de qual FAQ saiu, então um modelo compara a resposta com a
// FAQ esperada. Temperatura 0 e resultado no cache: a mesma resposta recebe
// sempre o mesmo veredito, e o que muda entre rodadas é só a resposta.
import { ObjectIdDe } from './busca.mjs';
import { CotaEsgotada, textoDaResposta } from './gemini.mjs';

// A mesma regex do PWA (pwa/src/app/api/n8n/resposta/route.ts), que decide o
// que vai para a curadoria. O travessão é o do texto fixo do agente.
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

const PROMPT = [
  'Você confere as respostas de um chatbot de saúde pública. O chatbot só pode responder com o',
  'que está nas FAQs oficiais da prefeitura.',
  '',
  'Você recebe a conversa até aqui, a pergunta nova do cidadão, as partes dessa pergunta e, para',
  'cada parte, as FAQs oficiais que a respondem, ou o aviso de que a base não tem essa',
  'informação. Recebe também a resposta que o chatbot deu.',
  '',
  'Para cada parte, classifique a resposta do chatbot:',
  '- "certa": traz a informação essencial de uma das FAQs indicadas para a parte, sem contradizer.',
  '- "errada": trata da parte, mas com informação que não está nas FAQs indicadas ou que as',
  '  contradiz (por exemplo, de outro exame, de outra unidade ou de outro remédio).',
  '- "nao_encontrou": diz que não encontrou a informação dessa parte.',
  '- "omitida": não trata dessa parte.',
  'Numa parte que a base não tem, use "nao_encontrou" se a resposta avisa que não encontrou,',
  '"errada" se a resposta afirma alguma coisa sobre ela, e "omitida" se nem a menciona.',
  '',
  'Não julgue estilo, tamanho nem formatação. Detalhe a mais que esteja na FAQ não é erro.',
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

  async function julgar({ historico, texto, partes, resposta }) {
    const blocos = [];
    for (const [i, parte] of partes.entries()) {
      const titulo = `Parte ${i + 1}: ${parte.descricao || (partes.length === 1 ? 'a pergunta inteira' : 'veja a pergunta')}`;
      if (!parte.faqs.length) {
        blocos.push(`${titulo}\n  A base não tem essa informação.`);
        continue;
      }
      const docs = await lerFaqs(parte.faqs);
      const textos = docs.map(
        (d) => `  FAQ oficial:\n    Assunto: ${d.category ?? ''}\n    Pergunta: ${d.question ?? ''}\n    Resposta: ${String(d.answer ?? '').slice(0, 1500)}`,
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
   * O veredito de um turno com gabarito. Devolve o veredito do turno, o de
   * cada parte e as notas para o relatório.
   */
  async function avaliar({ gabarito, historico, texto, resultado }) {
    if (!resultado.resposta) return { veredito: 'falha', partes: [], notas: resultado.falhas };
    const naoEncontrei = RE_NAO_ENCONTREI.test(resultado.resposta);

    if (gabarito.tipo === 'saudacao') {
      return { veredito: naoEncontrei ? 'nao_encontrei_indevido' : 'certa', partes: [], notas: [] };
    }

    const partes = gabarito.partes;
    let porParte;
    const notas = [];
    if (naoEncontrei) {
      porParte = partes.map((p) => (p.faqs.length ? 'nao_encontrei_indevido' : 'nao_encontrei_correto'));
    } else {
      let julgadas;
      try {
        julgadas = await julgar({ historico, texto, partes, resposta: resultado.resposta });
      } catch (erro) {
        if (erro instanceof CotaEsgotada) throw erro;
        return { veredito: 'falha', partes: [], notas: [`juiz: ${erro.message}`] };
      }
      porParte = partes.map((p, i) => {
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
    }
    return { veredito: vereditoDoTurno(porParte), partes: porParte, notas };
  }

  return { avaliar };
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

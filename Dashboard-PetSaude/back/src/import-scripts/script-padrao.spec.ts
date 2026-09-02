import { SCRIPT_PADRAO } from './script-padrao';

/**
 * O script padrão de geração de FAQs.
 *
 * LÓGICA DO LUCIANO: o script é texto guardado numa string — nada no build
 * confere se ele ao menos compila. Este teste carrega o texto de verdade e roda
 * as entradas que o scripts/enviar_dados.py trata, uma a uma. Se alguém mexer
 * num marcador e quebrar a extração, quebra aqui; sem isso, quebraria numa
 * importação de 300 linhas, depois de a pessoa ter preenchido a planilha.
 *
 * O carregamento troca os `export` por declarações locais e devolve os dois
 * símbolos. É a mesma coisa que o iframe do navegador faz com `import`, sem
 * precisar de módulo ES dentro do jest.
 */
type Faq = {
  question: string;
  answer: string;
  category: string;
  tags: string[];
  source: string;
  linha: number;
};
type Saida = { faqs: Faq[]; avisos: { linha: number; mensagem: string }[] };
type Entrada = {
  tipo: 'docx' | 'xlsx';
  nomeArquivo: string;
  paragrafos?: string[];
  linhas?: Record<string, string>[];
};

function carregarScript(): {
  modelo: any;
  gerarFaqs: (entrada: Entrada) => Saida;
} {
  const corpo =
    SCRIPT_PADRAO.replace(/^export const /gm, 'const ').replace(/^export function /gm, 'function ') +
    '\nreturn { modelo: modelo, gerarFaqs: gerarFaqs };';

  return new Function(corpo)() as any;
}

const { modelo, gerarFaqs } = carregarScript();

describe('script padrão — o contrato', () => {
  it('exporta modelo e gerarFaqs', () => {
    expect(typeof gerarFaqs).toBe('function');
    expect(modelo).toBeDefined();
  });

  it('declara as colunas da planilha que o modelo vazio vai usar', () => {
    expect(modelo.planilha.colunas).toEqual(['Pergunta', 'Resposta', 'Assunto', 'Tags', 'Fonte']);
  });

  it('declara instrucoes e exemplo para o modelo do Word', () => {
    expect(modelo.word.instrucoes.length).toBeGreaterThan(0);
    expect(modelo.word.exemplo.join('\n')).toContain('P:');
    expect(modelo.word.exemplo.join('\n')).toContain('R:');
  });
});

describe('script padrão — Word', () => {
  const doDocx = (paragrafos: string[], nomeArquivo = 'x.docx') =>
    gerarFaqs({ tipo: 'docx', nomeArquivo, paragrafos });

  it('extrai pergunta e resposta da mesma linha', () => {
    const r = doDocx(
      ['P: Qual a dose do paracetamol? R: 500mg. TAGS: dose, paracetamol. FONTE: Protocolo MS 2024.'],
      'FAQ medicamentos.docx',
    );

    expect(r.faqs).toHaveLength(1);
    expect(r.faqs[0].question).toBe('Qual a dose do paracetamol?');
    expect(r.faqs[0].answer).toBe('500mg.');
    expect(r.faqs[0].source).toBe('Protocolo MS 2024');
    // Assunto sai do nome do arquivo quando nao ha [ASSUNTO:].
    expect(r.faqs[0].category).toBe('medicamentos');
  });

  it('extrai pergunta e resposta de paragrafos separados, com metadados abaixo', () => {
    const r = doDocx([
      'P: Como armazenar a insulina?',
      'R: Deve ser mantida em refrigeracao entre 2C e 8C.',
      'TAGS: armazenamento, insulina. FONTE: Manual ABC.',
    ]);

    expect(r.faqs).toHaveLength(1);
    expect(r.faqs[0].answer).toBe('Deve ser mantida em refrigeracao entre 2C e 8C.');
    expect(r.faqs[0].tags).toEqual(['armazenamento', 'insulina']);
    expect(r.faqs[0].source).toBe('Manual ABC');
    // A linha aponta para o paragrafo do R:, que e onde a FAQ se completa.
    expect(r.faqs[0].linha).toBe(2);
  });

  it('nao deixa a fonte vazar para dentro das tags', () => {
    // Esta e a divergencia deliberada do enviar_dados.py. La o lookahead do
    // TAGS nao para no FONTE:, e o exemplo que a propria documentacao ensina
    // produz ["dose","paracetamol.","fonte:","protocolo","ms","2024."] —
    // palavras da fonte viram tags, e a busca por tag passa a casar com elas.
    const r = doDocx(['P: Q? R: A. TAGS: dose, paracetamol. FONTE: Protocolo MS 2024.']);

    expect(r.faqs[0].tags).toEqual(['dose', 'paracetamol']);
  });

  it('troca de assunto no meio do documento', () => {
    const r = doDocx(
      ['P: Primeira? R: Sim.', '[ASSUNTO: Medicamentos Especiais]', 'P: Segunda? R: Tambem.'],
      'geral.docx',
    );

    expect(r.faqs[0].category).toBe('geral');
    expect(r.faqs[1].category).toBe('medicamentos especiais');
  });

  it('aceita numeracao antes do marcador', () => {
    const r = doDocx(['1. P: Tem jejum?', 'R: Tem, 8 horas.']);

    expect(r.faqs[0].question).toBe('Tem jejum?');
  });

  it('aceita os marcadores por extenso', () => {
    const r = doDocx(['PERGUNTA: Tem jejum?', 'RESPOSTA: Tem, 8 horas.']);

    expect(r.faqs).toHaveLength(1);
    expect(r.faqs[0].answer).toBe('Tem, 8 horas.');
  });

  it('aceita fonte escrita como Ref: e corta a resposta antes dela', () => {
    const r = doDocx(['P: Q? R: A. Ref: Cartilha X.']);

    expect(r.faqs[0].source).toBe('Cartilha X');
    expect(r.faqs[0].answer).toBe('A.');
  });

  it('quebra tags do Word tambem no espaco, como o enviar_dados.py', () => {
    // Comportamento herdado de proposito: mudar aqui faria o mesmo .docx render
    // tags diferentes conforme entrasse pelo Drive ou pelo dashboard.
    const r = doDocx(['P: Q? R: A.', 'TAGS: #jejum #pressao alta']);

    expect(r.faqs[0].tags).toEqual(['jejum', 'pressao', 'alta']);
  });

  it('avisa quando a pergunta fica sem resposta', () => {
    const r = doDocx(['P: Sem resposta?']);

    expect(r.faqs).toHaveLength(0);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].linha).toBe(1);
  });

  it('avisa quando a resposta aparece sem pergunta antes', () => {
    const r = doDocx(['R: Sem pergunta.']);

    expect(r.faqs).toHaveLength(0);
    expect(r.avisos).toHaveLength(1);
  });

  it('avisa sobre os paragrafos que o formato descarta', () => {
    // O enviar_dados.py descarta a continuacao da resposta em silencio: quem
    // escreveu tres itens em tres paragrafos acha que os tres entraram. Aqui a
    // perda pelo menos aparece na previa, antes de gravar.
    const r = doDocx([
      'P: Como me preparar?',
      'R: Siga as orientacoes:',
      '- Jejum de 8 horas',
      '- Evite alcool',
    ]);

    expect(r.faqs).toHaveLength(1);
    expect(r.faqs[0].answer).toBe('Siga as orientacoes:');
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].mensagem).toContain('2 paragrafo(s)');
  });

  it('nao se perde com bullet digitado a mao antes do marcador', () => {
    const r = doDocx(['• P: Q? R: A.']);

    expect(r.faqs).toHaveLength(1);
  });

  it('documento vazio nao quebra', () => {
    expect(gerarFaqs({ tipo: 'docx', nomeArquivo: 'x.docx', paragrafos: [] })).toEqual({
      faqs: [],
      avisos: [],
    });
  });
});

describe('script padrão — planilha', () => {
  const doXlsx = (linhas: Record<string, string>[], nomeArquivo = 'x.xlsx') =>
    gerarFaqs({ tipo: 'xlsx', nomeArquivo, linhas });

  it('le uma FAQ por linha', () => {
    const r = doXlsx(
      [
        {
          Pergunta: 'Preciso de jejum?',
          Resposta: 'Sim, 8 horas.',
          Assunto: 'Exames',
          Tags: 'jejum, sangue, coleta',
          Fonte: 'Cartilha MS',
        },
      ],
      'faqs-agosto.xlsx',
    );

    expect(r.faqs).toHaveLength(1);
    expect(r.faqs[0].category).toBe('exames');
    expect(r.faqs[0].tags).toEqual(['jejum', 'sangue', 'coleta']);
    // Cabecalho na linha 1, entao a primeira FAQ esta na 2 — e e esse numero
    // que a previa mostra para a pessoa achar a linha na planilha dela.
    expect(r.faqs[0].linha).toBe(2);
  });

  it('nao quebra tags da planilha no espaco', () => {
    // Ao contrario do Word, aqui nao ha documento antigo para manter
    // compativel, e "pressao alta" precisa continuar sendo uma tag so.
    const r = doXlsx([
      { Pergunta: 'Q?', Resposta: 'A.', Assunto: 's', Tags: 'pressao alta; diabetes', Fonte: '' },
    ]);

    expect(r.faqs[0].tags).toEqual(['pressao alta', 'diabetes']);
  });

  it('casa o cabecalho ignorando caixa, acento e espaco sobrando', () => {
    const r = doXlsx([
      { 'PERGUNTA ': 'Casa?', resposta: 'Casa.', assunto: '', TAGS: 'a, b, c', fonte: '' },
    ]);

    expect(r.faqs).toHaveLength(1);
    expect(r.faqs[0].question).toBe('Casa?');
  });

  it('ignora linha totalmente em branco sem reclamar', () => {
    // Planilha preenchida a mao quase sempre tem linhas vazias no meio, e
    // transformar cada uma num aviso enterraria os problemas de verdade.
    const r = doXlsx([{ Pergunta: '', Resposta: '', Assunto: '', Tags: '', Fonte: '' }]);

    expect(r.faqs).toHaveLength(0);
    expect(r.avisos).toHaveLength(0);
  });

  it('avisa quando so um dos dois campos obrigatorios esta preenchido', () => {
    const r = doXlsx([{ Pergunta: 'So pergunta', Resposta: '', Assunto: '', Tags: '', Fonte: '' }]);

    expect(r.faqs).toHaveLength(0);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].linha).toBe(2);
  });

  it('herda o assunto do nome do arquivo quando a coluna esta vazia', () => {
    const r = doXlsx(
      [{ Pergunta: 'Q?', Resposta: 'A.', Assunto: '', Tags: 'a, b, c', Fonte: '' }],
      'faqs-agosto.xlsx',
    );

    expect(r.faqs[0].category).toBe('faqs-agosto');
  });
});

/**
 * Script de geração de FAQs embutido no código.
 *
 * LÓGICA DO LUCIANO: é o que roda quando a tabela `import_scripts` está vazia, e
 * o que o botão "restaurar padrão" grava. Reproduz o scripts/enviar_dados.py —
 * inclusive as decisões dele que surpreendem, como a resposta sair de um único
 * parágrafo e as tags do Word quebrarem também no espaço. Divergir aqui faria o
 * mesmo documento render FAQs diferentes conforme entrasse pelo Drive ou pelo
 * dashboard, e ninguém compararia os dois para descobrir.
 *
 * O texto abaixo vira código do usuário no momento em que ele salva uma versão.
 * O servidor nunca o executa: quem executa é o navegador, num iframe de origem
 * nula com a rede cortada por CSP.
 */
export const NOME_SCRIPT_PADRAO = 'Padrao P/R (compativel com enviar_dados.py)';

export const SCRIPT_PADRAO = `
// ===========================================================================
// Script de geracao de FAQs — formato P/R
//
// Dois exports, e o contrato e so isso:
//
//   modelo      descreve os modelos vazios .xlsx e .docx que o dashboard gera
//   gerarFaqs   recebe o documento decodificado e devolve as FAQs
//
// Entrada de gerarFaqs:
//   { tipo: 'docx' | 'xlsx', nomeArquivo: string,
//     paragrafos?: string[],                   // docx, ja sem linhas em branco
//     linhas?: Array<Record<string,string>> }  // xlsx, chaveado pelo cabecalho
//
// Saida:
//   { faqs: [{ question, answer, category, tags, source, linha }],
//     avisos: [{ linha, mensagem }] }
//
// Quem valida se a FAQ presta e o backend, com as mesmas regras do formulario
// manual. Aqui so se decide FORMATO.
// ===========================================================================

export const modelo = {
  nome: 'Padrao P/R',

  planilha: {
    colunas: ['Pergunta', 'Resposta', 'Assunto', 'Tags', 'Fonte'],
    // Viram as primeiras linhas do modelo vazio, como exemplo preenchido.
    exemplos: [
      [
        'Preciso de jejum para o exame de sangue?',
        'Sim. O jejum recomendado e de 8 horas. Agua pode.',
        'exames',
        'jejum, sangue, coleta',
        'Cartilha do Ministerio da Saude, 2024',
      ],
      [
        'Como devo guardar a insulina?',
        'Mantenha sob refrigeracao, entre 2 C e 8 C. Nao congele.',
        'medicamentos',
        'insulina, armazenamento, geladeira',
        'Manual de Diabetes',
      ],
    ],
    ajuda: [
      'Uma FAQ por linha. Nao apague nem renomeie a linha de cabecalho.',
      'Tags separadas por virgula. Sao necessarias pelo menos 3.',
      'Assunto vazio faz a FAQ herdar o nome do arquivo como assunto.',
      'Fonte e opcional.',
    ],
  },

  word: {
    instrucoes: [
      'Escreva uma pergunta por paragrafo, comecando com P:',
      'A resposta vem no paragrafo seguinte, comecando com R:',
      'ATENCAO: a resposta e lida de UM paragrafo so. Paragrafos soltos abaixo',
      'do R: sao ignorados — se a resposta tem varios itens, escreva todos na',
      'mesma linha, separados por ponto e virgula.',
      'TAGS: e FONTE: podem ficar na mesma linha da resposta ou no paragrafo',
      'logo abaixo. Sao necessarias pelo menos 3 tags.',
      'Para trocar o assunto no meio do documento, escreva [ASSUNTO: nome].',
      'Sem nenhum [ASSUNTO:], o assunto vira o nome do arquivo.',
    ],
    exemplo: [
      '[ASSUNTO: Exames]',
      'P: Preciso de jejum para o exame de sangue?',
      'R: Sim. O jejum recomendado e de 8 horas. Agua pode.',
      'TAGS: jejum, sangue, coleta. FONTE: Cartilha do Ministerio da Saude, 2024.',
      '',
      'P: Como devo guardar a insulina?',
      'R: Mantenha sob refrigeracao, entre 2 C e 8 C. Nao congele.',
      'TAGS: insulina, armazenamento, geladeira. FONTE: Manual de Diabetes.',
    ],
  },
};

// --- marcadores -----------------------------------------------------------

var RE_ASSUNTO    = /\\[ASSUNTO:\\s*(.+?)\\]/i;
var RE_P_QUALQUER = /\\b(?:P|PERGUNTA):\\s*/i;
var RE_R_QUALQUER = /\\b(?:R|RESPOSTA):\\s*/i;
var RE_P_INICIO   = /^(?:\\d+\\.\\s*)?\\b(?:P|PERGUNTA):\\s*/i;
var RE_R_INICIO   = /^\\b(?:R|RESPOSTA):\\s*/i;
var RE_P_EM_QUALQUER_LUGAR = /(?:\\d+\\.\\s*)?\\b(?:P|PERGUNTA):\\s*/i;

// A ordem das alternativas importa e e a mesma do Python: 'ref:' casa antes de
// '(ref:', entao um '(' sobra no fim da resposta. Preservado de proposito — o
// mesmo documento tem de render o mesmo resultado nos dois caminhos.
var RE_METADADOS  = /tags:|fonte:|ref:|\\(ref:/i;
var RE_FONTE      = /(?:FONTE:|Ref:|\\(Ref:)\\s*([^)\\n\\t]+)/i;
// DIVERGENCIA DELIBERADA do enviar_dados.py, a unica deste script.
//
// La o lookahead so para em "P:", "PERGUNTA:" ou no fim da janela. Como a
// janela junta tres paragrafos numa linha so, escrever o exemplo que a propria
// documentacao ensina —
//     TAGS: dose, paracetamol. FONTE: Protocolo MS 2024.
// — faz a captura engolir a fonte inteira, e as tags saem
//     ["dose", "paracetamol.", "fonte:", "protocolo", "ms", "2024."]
// porque logo depois tudo e quebrado tambem no espaco. Replicar isso seria
// importar lixo de proposito. Aqui a captura para tambem no marcador de fonte.
var RE_TAGS       = /TAGS:\\s*(.+?)(?=\\s*P:|\\s*PERGUNTA:|\\s*FONTE:|\\s*Ref:|\\s*\\(Ref:|$|\\n)/i;
var RE_MARCADOR   = /^[\\u2022\\-*\\u27a2]\\s*/;

// --- utilitarios ----------------------------------------------------------

function texto(valor) {
  return valor === null || valor === undefined ? '' : String(valor).trim();
}

// Preserva a formatacao de listas do Word, como o converter_para_markdown do
// enviar_dados.py. O decodificador do navegador ja prefixa os <li> com '- ';
// isto normaliza os bullets digitados a mao.
function normalizarLinha(valor) {
  var limpo = texto(valor);
  if (RE_MARCADOR.test(limpo)) return '- ' + limpo.replace(RE_MARCADOR, '');
  return limpo;
}

function assuntoDoArquivo(nomeArquivo) {
  return texto(nomeArquivo)
    .replace(/FAQ/g, '')
    .replace(/\\.(docx|xlsx)$/i, '')
    .trim()
    .toLowerCase();
}

function limparResposta(bruto) {
  return texto(bruto).split(RE_METADADOS)[0].trim();
}

// TAGS e FONTE valem numa janela de tres paragrafos: o anterior, o atual e o
// seguinte. E o que permite escrever os metadados na linha de baixo.
function metadadosAoRedor(linhas, i) {
  var janela = linhas.slice(Math.max(0, i - 1), Math.min(linhas.length, i + 2)).join(' ');

  var mFonte = janela.match(RE_FONTE);
  var fonte = mFonte ? mFonte[1].trim().replace(/[.)]+$/, '') : '';

  var mTags = janela.match(RE_TAGS);
  var tags = [];
  if (mTags) {
    // Quebra tambem no espaco, e nao so na virgula. Consequencia conhecida:
    // "pressao alta" vira duas tags. E assim no enviar_dados.py, e mudar aqui
    // faria o mesmo .docx gerar tags diferentes conforme o caminho de entrada.
    // Na planilha o comportamento e outro, porque la o formato e novo.
    tags = mTags[1]
      .replace(/#/g, '')
      .split(/[,\\s]+/)
      // Tira pontuacao das pontas pela mesma razao da divergencia acima: o
      // exemplo documentado termina a lista em ponto, e "paracetamol." nunca
      // casaria com a busca por "paracetamol".
      .map(function (t) { return t.trim().toLowerCase().replace(/^[.,;:]+|[.,;:]+$/g, ""); })
      .filter(Boolean);
  }

  return { tags: tags, fonte: fonte };
}

// --- Word -----------------------------------------------------------------

function gerarDeParagrafos(paragrafos, nomeArquivo) {
  var linhas = (paragrafos || [])
    .map(normalizarLinha)
    .filter(function (l) { return l.length > 0; });

  var faqs = [];
  var avisos = [];
  var ignoradas = [];

  var assunto = assuntoDoArquivo(nomeArquivo);
  var perguntaPendente = '';
  var linhaDaPergunta = 0;

  for (var i = 0; i < linhas.length; i++) {
    var linha = linhas[i];
    // Numero do paragrafo desconsiderando linhas em branco, igual ao Python.
    var numero = i + 1;

    var mAssunto = linha.match(RE_ASSUNTO);
    if (mAssunto) {
      assunto = mAssunto[1].trim().toLowerCase();
      continue;
    }

    var pergunta = null;
    var resposta = null;
    var mR = RE_R_QUALQUER.exec(linha);

    if (RE_P_QUALQUER.test(linha) && mR) {
      // Pergunta e resposta na mesma linha.
      var antes = linha.slice(0, mR.index);
      var depois = linha.slice(mR.index + mR[0].length);
      pergunta = antes.replace(RE_P_EM_QUALQUER_LUGAR, '').trim();
      resposta = limparResposta(depois);
    } else if (RE_P_INICIO.test(linha)) {
      perguntaPendente = linha.replace(RE_P_INICIO, '').trim();
      linhaDaPergunta = numero;
      continue;
    } else if (RE_R_INICIO.test(linha)) {
      if (perguntaPendente) {
        pergunta = perguntaPendente;
        resposta = limparResposta(linha.replace(RE_R_INICIO, ''));
        perguntaPendente = '';
      } else {
        avisos.push({
          linha: numero,
          mensagem: 'Resposta (R:) sem nenhuma pergunta (P:) antes dela — ignorada.',
        });
        continue;
      }
    } else {
      // Nao e marcador. Se tambem nao carrega so metadados, e conteudo que o
      // formato descarta — tipicamente a continuacao de uma resposta longa.
      if (!RE_METADADOS.test(linha)) ignoradas.push(numero);
      continue;
    }

    if (pergunta && resposta) {
      var meta = metadadosAoRedor(linhas, i);
      faqs.push({
        question: pergunta,
        answer: resposta,
        category: assunto,
        tags: meta.tags,
        source: meta.fonte,
        linha: numero,
      });
    }
  }

  if (perguntaPendente) {
    avisos.push({
      linha: linhaDaPergunta,
      mensagem: 'Pergunta sem resposta (R:) depois dela — ignorada.',
    });
  }

  if (ignoradas.length > 0) {
    // Um aviso so, com os primeiros numeros. O enviar_dados.py descarta estes
    // paragrafos em silencio; aqui pelo menos aparecem na previa, porque quase
    // sempre sao a continuacao de uma resposta que a pessoa achou que entrou.
    var amostra = ignoradas.slice(0, 8).join(', ');
    avisos.push({
      linha: ignoradas[0],
      mensagem:
        ignoradas.length +
        ' paragrafo(s) fora do formato nao entraram (linhas ' +
        amostra +
        (ignoradas.length > 8 ? ' e outros' : '') +
        '). A resposta e lida de um paragrafo so, o que comeca com R:.',
    });
  }

  return { faqs: faqs, avisos: avisos };
}

// --- planilha -------------------------------------------------------------

function chaveNormalizada(valor) {
  return texto(valor)
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase();
}

// Cabecalho digitado com acento diferente ou em CAIXA ALTA continua casando.
function pegarColuna(linha, nome) {
  var alvo = chaveNormalizada(nome);
  var chaves = Object.keys(linha);
  for (var i = 0; i < chaves.length; i++) {
    if (chaveNormalizada(chaves[i]) === alvo) return texto(linha[chaves[i]]);
  }
  return '';
}

function gerarDeLinhas(linhas, nomeArquivo) {
  var colunas = modelo.planilha.colunas;
  var faqs = [];
  var avisos = [];
  var padraoAssunto = assuntoDoArquivo(nomeArquivo);

  for (var i = 0; i < (linhas || []).length; i++) {
    var bruta = linhas[i] || {};
    // Cabecalho na linha 1, entao a primeira linha de dados e a 2.
    var numero = i + 2;

    var pergunta = pegarColuna(bruta, colunas[0]);
    var resposta = pegarColuna(bruta, colunas[1]);

    // Linha totalmente em branco no meio da planilha e comum e nao e erro.
    if (!pergunta && !resposta) continue;

    if (!pergunta || !resposta) {
      avisos.push({
        linha: numero,
        mensagem: 'Linha com ' + (pergunta ? 'resposta' : 'pergunta') + ' em branco — ignorada.',
      });
      continue;
    }

    // Na planilha as tags quebram so na virgula e no ponto e virgula. Ao
    // contrario do Word, aqui nao ha documento antigo para manter compativel, e
    // quebrar no espaco transformaria "pressao alta" em duas tags.
    var tags = pegarColuna(bruta, colunas[3])
      .replace(/#/g, '')
      .split(/[,;]/)
      .map(function (t) { return t.trim().toLowerCase().replace(/^[.,;:]+|[.,;:]+$/g, ""); })
      .filter(Boolean);

    faqs.push({
      question: pergunta,
      answer: resposta,
      category: pegarColuna(bruta, colunas[2]).toLowerCase() || padraoAssunto,
      tags: tags,
      source: pegarColuna(bruta, colunas[4]),
      linha: numero,
    });
  }

  return { faqs: faqs, avisos: avisos };
}

// --- ponto de entrada -----------------------------------------------------

export function gerarFaqs(entrada) {
  var dados = entrada || {};
  if (dados.tipo === 'xlsx') return gerarDeLinhas(dados.linhas, dados.nomeArquivo);
  return gerarDeParagrafos(dados.paragrafos, dados.nomeArquivo);
}
`;

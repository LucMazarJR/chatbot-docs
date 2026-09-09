'use client';

import { useCallback, useEffect, useState } from 'react';

import { renderizar } from '@/lib/wa-format';
import type {
  Estatisticas,
  Filtro,
  FiltroVersao,
  Mensagem,
  Periodo,
  Sessao,
  SessaoResumida,
} from '@/lib/tipos';

import './revisao.css';

type Detalhe = { sessao: Sessao; mensagens: Mensagem[] };

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '7d', rotulo: '7 dias' },
  { valor: '30d', rotulo: '30 dias' },
  { valor: 'tudo', rotulo: 'Tudo' },
];

const VERSOES: { valor: FiltroVersao; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'A + B' },
  { valor: 'a', rotulo: 'Versão A' },
  { valor: 'b', rotulo: 'Versão B' },
];

const SITUACOES: { valor: Filtro; rotulo: string; titulo?: string }[] = [
  { valor: 'validas', rotulo: 'Com interação' },
  { valor: 'negativos', rotulo: '👎 Resposta ruim' },
  { valor: 'nota-baixa', rotulo: 'Nota ≤ 3' },
  { valor: 'sem-resposta', rotulo: 'Não encontrou' },
  { valor: 'com-erro', rotulo: 'Falhou / demorou', titulo: 'Conversas com alguma resposta que não completou' },
  {
    valor: 'todas',
    rotulo: 'Todas',
    titulo: 'Inclui as visitas que abriram a página e saíram sem perguntar nada',
  },
];

export default function Revisao() {
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [lista, setLista] = useState<SessaoResumida[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('validas');
  const [periodo, setPeriodo] = useState<Periodo>('tudo');
  const [versao, setVersao] = useState<FiltroVersao>('todas');
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const busca = `periodo=${periodo}&versao=${versao}`;
    try {
      const [numeros, sessoes] = await Promise.all([
        fetch(`/api/admin/estatisticas?${busca}`).then((r) => r.json() as Promise<Estatisticas>),
        fetch(`/api/admin/sessoes?${busca}&filtro=${filtro}`).then(
          (r) => r.json() as Promise<SessaoResumida[]>,
        ),
      ]);
      setEstatisticas(numeros);
      setLista(sessoes);
    } finally {
      setCarregando(false);
    }
  }, [filtro, periodo, versao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!selecionada) return setDetalhe(null);
    void fetch(`/api/admin/sessoes/${selecionada}`)
      .then((r) => r.json() as Promise<Detalhe>)
      .then(setDetalhe);
  }, [selecionada]);

  return (
    <div className="revisao">
      <header className="revisao-topo">
        <div>
          <h1>Protótipo PWA — interações</h1>
          <p>Conversas registradas durante a validação, com os bastidores de cada resposta.</p>
        </div>

        <div className="revisao-acoes">
          <button onClick={() => void carregar()} disabled={carregando}>
            {carregando ? 'Atualizando…' : 'Atualizar'}
          </button>
          <a href="/api/admin/exportar?formato=csv">Exportar CSV</a>
          <a href="/api/admin/exportar?formato=json">JSON</a>
        </div>
      </header>

      {/* Os três filtros ficam separados porque respondem a perguntas
          diferentes: QUANDO, QUAL interface, e O QUE deu errado. Juntos numa
          fileira só, ninguém percebia que dava para combinar. */}
      <div className="filtros-barra">
        <Grupo rotulo="Período">
          {PERIODOS.map(({ valor, rotulo }) => (
            <Chip key={valor} ativo={periodo === valor} onClick={() => setPeriodo(valor)}>
              {rotulo}
            </Chip>
          ))}
        </Grupo>

        <Grupo rotulo="Interface">
          {VERSOES.map(({ valor, rotulo }) => (
            <Chip key={valor} ativo={versao === valor} onClick={() => setVersao(valor)}>
              {rotulo}
            </Chip>
          ))}
        </Grupo>

        <Grupo rotulo="Situação">
          {SITUACOES.map(({ valor, rotulo, titulo }) => (
            <Chip
              key={valor}
              ativo={filtro === valor}
              titulo={titulo}
              onClick={() => setFiltro(valor)}
            >
              {rotulo}
            </Chip>
          ))}
        </Grupo>
      </div>

      {estatisticas && <Painel dados={estatisticas} />}

      <div className="revisao-corpo">
        <aside className="painel-lista">
          <div className="lista-cabecalho">
            {lista.length} {lista.length === 1 ? 'conversa' : 'conversas'}
          </div>

          {lista.length === 0 && <p className="vazio">Nenhuma conversa com esses filtros.</p>}

          {lista.map((sessao) => (
            <button
              key={sessao._id}
              className={'item-sessao' + (selecionada === sessao._id ? ' ativo' : '')}
              onClick={() => setSelecionada(sessao._id)}
            >
              <div className="item-topo">
                <strong>
                  {/* A letra da interface vem antes do nome: é a comparação que
                      motivou o teste, e precisa ser lida sem abrir a sessão. */}
                  <span className={'versao versao-' + (sessao.versao ?? 'a')}>
                    {(sessao.versao ?? 'a').toUpperCase()}
                  </span>
                  {sessao.nome}
                </strong>
                <span>{formatarData(sessao.iniciadaEm)}</span>
              </div>

              <div className="item-marcas">
                {sessao.qtdPerguntas === 0 ? (
                  <span className="marca vazia">sem interação · fora da análise</span>
                ) : (
                  <span>
                    {sessao.qtdPerguntas} {sessao.qtdPerguntas === 1 ? 'pergunta' : 'perguntas'}
                  </span>
                )}
                {sessao.avaliacao?.estrelas != null && (
                  <span className="marca nota">{'★'.repeat(sessao.avaliacao.estrelas)}</span>
                )}
                {sessao.avaliacao?.nps != null && (
                  <span className="marca">NPS {sessao.avaliacao.nps}</span>
                )}
                {sessao.negativos > 0 && <span className="marca ruim">👎 {sessao.negativos}</span>}
                {sessao.positivos > 0 && <span className="marca boa">👍 {sessao.positivos}</span>}
                {sessao.semResposta > 0 && (
                  <span className="marca alerta">{sessao.semResposta} sem resposta</span>
                )}
                {sessao.erros > 0 && <span className="marca ruim">{sessao.erros} falhou</span>}
                {sessao.latenciaMaxima != null && sessao.latenciaMaxima >= 30_000 && (
                  <span className="marca alerta" title="Resposta mais lenta desta conversa">
                    até {(sessao.latenciaMaxima / 1000).toFixed(0)}s
                  </span>
                )}
              </div>
            </button>
          ))}
        </aside>

        <section className="painel-conversa">
          {!detalhe && <p className="vazio">Selecione uma conversa à esquerda.</p>}

          {detalhe && (
            <>
              <div className="conversa-cabecalho">
                <h2>
                  <span className={'versao versao-' + (detalhe.sessao.versao ?? 'a')}>
                    {(detalhe.sessao.versao ?? 'a').toUpperCase()}
                  </span>
                  {detalhe.sessao.nome}
                </h2>
                <span>
                  {formatarData(detalhe.sessao.iniciadaEm)} · {duracao(detalhe.sessao)}
                </span>

                {detalhe.sessao.avaliacao && (
                  <div className="avaliacao-resumo">
                    {detalhe.sessao.avaliacao.estrelas != null && (
                      <span>Nota {detalhe.sessao.avaliacao.estrelas}/5</span>
                    )}
                    {detalhe.sessao.avaliacao.nps != null && (
                      <span>NPS {detalhe.sessao.avaliacao.nps}/10</span>
                    )}
                    {detalhe.sessao.avaliacao.comentario && (
                      <blockquote>{detalhe.sessao.avaliacao.comentario}</blockquote>
                    )}
                  </div>
                )}
              </div>

              <div className="transcricao">
                {detalhe.mensagens.map((mensagem) => (
                  <div key={mensagem._id}>
                    <div className={'linha-r ' + mensagem.papel}>
                      <div
                        className={'balao-r' + (mensagem.papel === 'bot' ? ' clicavel' : '')}
                        onClick={() =>
                          mensagem.papel === 'bot' &&
                          setExpandida(expandida === mensagem._id ? null : mensagem._id)
                        }
                      >
                        <span dangerouslySetInnerHTML={{ __html: renderizar(mensagem.texto) }} />

                        <div className="rodape-balao">
                          <span>{formatarHora(mensagem.em)}</span>
                          {mensagem.papel === 'bot' && (
                            <>
                              <span
                                className={(mensagem.latenciaMs ?? 0) >= 30_000 ? 'alerta' : ''}
                              >
                                {((mensagem.latenciaMs ?? 0) / 1000).toFixed(1)}s
                              </span>
                              {mensagem.semResposta && (
                                <span className="alerta">não encontrou</span>
                              )}
                              {/* O motivo aparece aqui porque é onde alguém vai
                                  olhar quando o protótipo "não respondeu":
                                  distingue demora de token errado sem precisar
                                  caçar o log da requisição. */}
                              {mensagem.erro && (
                                <span className="ruim">
                                  falhou: {mensagem.motivoErro ?? 'motivo não registrado'}
                                </span>
                              )}
                              {mensagem.feedback === 'up' && <span className="boa">👍</span>}
                              {mensagem.feedback === 'down' && <span className="ruim">👎</span>}
                              {mensagem.feedbackComentario && (
                                <span className="comentario-feedback">
                                  “{mensagem.feedbackComentario}”
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {expandida === mensagem._id && <Trechos mensagem={mensagem} />}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Grupo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="filtro-grupo">
      <span className="filtro-rotulo">{rotulo}</span>
      <div className="filtro-chips">{children}</div>
    </div>
  );
}

function Chip({
  ativo,
  titulo,
  onClick,
  children,
}: {
  ativo: boolean;
  titulo?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={ativo ? 'ativo' : ''} title={titulo} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * Os números do topo, agrupados por pergunta.
 *
 * Uma fileira única de dez cartões iguais obriga a ler todos para achar um.
 * Separados por assunto — quanto usaram, se gostaram, se aguentou —, dá para ir
 * direto ao que interessa.
 */
function Painel({ dados }: { dados: Estatisticas }) {
  const grupos: { titulo: string; cartoes: [string, string, boolean?][] }[] = [
    {
      titulo: 'Uso',
      cartoes: [
        ['Conversas', String(dados.sessoes)],
        ['Perguntas', String(dados.respostas)],
        ['Avaliadas', `${dados.sessoesAvaliadas}/${dados.sessoes}`],
      ],
    },
    {
      titulo: 'Qualidade',
      cartoes: [
        ['Nota média', dados.notaMedia ? `${dados.notaMedia.toFixed(1)} ★` : '—'],
        ['NPS', dados.npsScore != null ? String(dados.npsScore) : '—'],
        [
          'Não encontrou',
          dados.percentualSemResposta != null
            ? `${dados.percentualSemResposta.toFixed(0)}%`
            : '—',
          (dados.percentualSemResposta ?? 0) >= 30,
        ],
        ['👍 / 👎', `${dados.positivos} / ${dados.negativos}`],
      ],
    },
    {
      titulo: 'Desempenho',
      cartoes: [
        [
          'Tempo médio',
          dados.latenciaMedia ? `${(dados.latenciaMedia / 1000).toFixed(1)}s` : '—',
          (dados.latenciaMedia ?? 0) >= 30_000,
        ],
        [
          'Pior 5%',
          dados.latenciaP95 ? `${(dados.latenciaP95 / 1000).toFixed(0)}s` : '—',
          (dados.latenciaP95 ?? 0) >= 60_000,
        ],
        ['Acima de 30s', String(dados.respostasLentas), dados.respostasLentas > 0],
        ['Falhas', String(dados.erros), dados.erros > 0],
      ],
    },
  ];

  return (
    <>
      <div className="paineis">
        {grupos.map(({ titulo, cartoes }) => (
          <section className="painel-grupo" key={titulo}>
            <h2>{titulo}</h2>
            <div className="cartoes">
              {cartoes.map(([rotulo, valor, alerta]) => (
                <div className={'cartao' + (alerta ? ' cartao-alerta' : '')} key={rotulo}>
                  <span className="cartao-valor">{valor}</span>
                  <span className="cartao-rotulo">{rotulo}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Dito em voz baixa, mas dito: sem isto alguém compara o total daqui com
          o número de links distribuídos e conclui que sumiram sessões. */}
      {dados.sessoesVazias > 0 && (
        <p className="nota-descartadas">
          {dados.sessoesVazias}{' '}
          {dados.sessoesVazias === 1 ? 'visita não entrou' : 'visitas não entraram'} nos números
          acima — abriram a página e saíram sem perguntar nada. Aparecem no filtro “Todas”.
        </p>
      )}
    </>
  );
}

/**
 * Os bastidores de uma resposta: cada trecho que a busca vetorial devolveu, com
 * o seu score e se passou do limiar.
 *
 * É o painel mais útil da tela. O limiar de 0.82 do fluxo foi estimado a partir
 * de cinco consultas manuais; olhar aqui, numa resposta que o participante
 * marcou com 👎, mostra se o corte está alto demais (o trecho certo ficou de
 * fora por pouco) ou baixo demais (entrou ruído que confundiu o agente).
 */
function Trechos({ mensagem }: { mensagem: Mensagem }) {
  const trechos = mensagem.trechosDebug ?? [];

  if (trechos.length === 0) {
    return <div className="trechos vazio-trechos">A busca não devolveu nenhum trecho.</div>;
  }

  return (
    <div className="trechos">
      <div className="trechos-topo">
        {trechos.length} trechos recuperados · limiar {mensagem.limiarScore ?? '?'} ·{' '}
        {mensagem.qtdTrechos} usados · {mensagem.modelo ?? 'modelo não informado'}
      </div>

      <table>
        <thead>
          <tr>
            <th>Score</th>
            <th>Usado</th>
            <th>Assunto</th>
            <th>Pergunta da base</th>
          </tr>
        </thead>
        <tbody>
          {trechos.map((trecho, indice) => (
            <tr key={indice} className={trecho.usado ? 'usado' : 'cortado'}>
              <td className="score">{trecho.score.toFixed(3)}</td>
              <td>{trecho.usado ? 'sim' : 'não'}</td>
              <td>{trecho.category ?? '—'}</td>
              <td title={trecho.previa ?? ''}>{trecho.question ?? trecho.previa ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatarData(valor: Date | string) {
  return new Date(valor).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatarHora(valor: Date | string) {
  return new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function duracao(sessao: Sessao) {
  if (!sessao.encerradaEm) return 'em aberto';
  const ms = new Date(sessao.encerradaEm).getTime() - new Date(sessao.iniciadaEm).getTime();
  return `${Math.max(1, Math.round(ms / 60000))} min`;
}

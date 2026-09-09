'use client';

import { useCallback, useEffect, useState } from 'react';

import { renderizar } from '@/lib/wa-format';
import type { Estatisticas, Filtro, Mensagem, Sessao, SessaoResumida } from '@/lib/tipos';

import './revisao.css';

type Detalhe = { sessao: Sessao; mensagens: Mensagem[] };

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: null, rotulo: 'Todas' },
  { valor: 'negativos', rotulo: 'Com 👎' },
  { valor: 'nota-baixa', rotulo: 'Nota ≤ 3' },
  { valor: 'sem-resposta', rotulo: 'Com "não encontrei"' },
];

export default function Revisao() {
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [lista, setLista] = useState<SessaoResumida[]>([]);
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const busca = filtro ? `?filtro=${filtro}` : '';
    const [numeros, sessoes] = await Promise.all([
      fetch('/api/admin/estatisticas').then((r) => r.json() as Promise<Estatisticas>),
      fetch(`/api/admin/sessoes${busca}`).then((r) => r.json() as Promise<SessaoResumida[]>),
    ]);
    setEstatisticas(numeros);
    setLista(sessoes);
  }, [filtro]);

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
          <button onClick={() => void carregar()}>Atualizar</button>
          <a href="/api/admin/exportar?formato=csv">Exportar CSV</a>
          <a href="/api/admin/exportar?formato=json">JSON</a>
        </div>
      </header>

      {estatisticas && <Cartoes dados={estatisticas} />}

      <div className="revisao-corpo">
        <aside className="painel-lista">
          <div className="filtros">
            {FILTROS.map(({ valor, rotulo }) => (
              <button
                key={rotulo}
                className={filtro === valor ? 'ativo' : ''}
                onClick={() => setFiltro(valor)}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {lista.length === 0 && <p className="vazio">Nenhuma sessão com esse filtro.</p>}

          {lista.map((sessao) => (
            <button
              key={sessao._id}
              className={'item-sessao' + (selecionada === sessao._id ? ' ativo' : '')}
              onClick={() => setSelecionada(sessao._id)}
            >
              <div className="item-topo">
                <strong>{sessao.nome}</strong>
                <span>{formatarData(sessao.iniciadaEm)}</span>
              </div>

              <div className="item-marcas">
                <span>{sessao.qtdPerguntas} perguntas</span>
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
              </div>
            </button>
          ))}
        </aside>

        <section className="painel-conversa">
          {!detalhe && <p className="vazio">Selecione uma sessão à esquerda.</p>}

          {detalhe && (
            <>
              <div className="conversa-cabecalho">
                <h2>{detalhe.sessao.nome}</h2>
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
                        className={
                          'balao-r' + (mensagem.papel === 'bot' ? ' clicavel' : '')
                        }
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
                              <span>{mensagem.latenciaMs} ms</span>
                              {mensagem.semResposta && <span className="alerta">não encontrou</span>}
                              {/* O motivo da falha aparece aqui porque é onde
                                  alguém vai olhar quando o protótipo "não
                                  respondeu": distingue timeout de token errado
                                  sem precisar caçar o log da requisição. */}
                              {mensagem.erro && (
                                <span className="ruim">falhou: {mensagem.motivoErro ?? 'motivo não registrado'}</span>
                              )}
                              {mensagem.feedback === 'up' && <span className="boa">👍</span>}
                              {mensagem.feedback === 'down' && <span className="ruim">👎</span>}
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

function Cartoes({ dados }: { dados: Estatisticas }) {
  const cartoes: [string, string][] = [
    ['Sessões', String(dados.sessoes)],
    ['Avaliadas', `${dados.sessoesAvaliadas}/${dados.sessoes}`],
    ['Perguntas', String(dados.respostas)],
    ['Nota média', dados.notaMedia ? `${dados.notaMedia.toFixed(1)} ★` : '—'],
    ['NPS', dados.npsScore != null ? String(dados.npsScore) : '—'],
    [
      'Sem resposta',
      dados.percentualSemResposta != null ? `${dados.percentualSemResposta.toFixed(0)}%` : '—',
    ],
    ['👍 / 👎', `${dados.positivos} / ${dados.negativos}`],
    ['Latência média', dados.latenciaMedia ? `${(dados.latenciaMedia / 1000).toFixed(1)} s` : '—'],
    ['Latência p95', dados.latenciaP95 ? `${(dados.latenciaP95 / 1000).toFixed(1)} s` : '—'],
    ['Erros', String(dados.erros)],
  ];

  return (
    <div className="cartoes">
      {cartoes.map(([rotulo, valor]) => (
        <div className="cartao" key={rotulo}>
          <span className="cartao-valor">{valor}</span>
          <span className="cartao-rotulo">{rotulo}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Os bastidores de uma resposta: cada trecho que a busca vetorial devolveu, com
 * o seu score e se passou do limiar.
 *
 * É o painel mais útil da tela. O limiar de 0.82 do fluxo foi estimado a partir
 * de cinco consultas manuais; olhar aqui, numa resposta que o participante
 * marcou com 👎, mostra se o corte está alto demais (o trecho certo ficou de
 * fora por pouco) ou baixo demais (entrou lixo que confundiu o agente).
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

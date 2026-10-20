'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { VoltarParaConversa } from '@/components/VoltarParaConversa';
import type { ConversaResumida } from '@/lib/conta/conversas';
import type { ContaPublica } from '@/lib/conta/tipos';
import { dataCurta } from '@/lib/datas';
import { guardarLimiteDeTempo, lerLimiteDeTempo } from '@/lib/limite-de-tempo';

const MODOS_DE_TEMPO = [
  {
    com: true,
    rotulo: 'Com limite de tempo',
    descricao: 'Se o assistente não conseguir responder em cerca de 1 minuto e meio, ele avisa para perguntar de novo.',
  },
  {
    com: false,
    rotulo: 'Sem limite de tempo',
    descricao: 'O assistente espera o quanto precisar para responder, até 4 minutos.',
  },
];

/**
 * O modo de espera da resposta (em teste), para o grupo comparar.
 *
 * Mora aqui, e não em Letra e voz: é escolha de quem está testando o
 * assistente, e não ajuste de leitura. Vale para as próximas perguntas deste
 * aparelho, sem recarregar a conversa.
 */
function TempoDeResposta() {
  const [comLimite, setComLimite] = useState(true);
  // Lido depois de montar: no servidor não há `localStorage`.
  useEffect(() => setComLimite(lerLimiteDeTempo()), []);

  return (
    <section className="st-cartao">
      <h2 id="rotulo-tempo">Tempo de resposta (em teste)</h2>
      <p>Quando o serviço de IA está lento, a resposta pode demorar. Escolha como o assistente espera.</p>
      <div role="radiogroup" aria-labelledby="rotulo-tempo" className="opcoes-tema">
        {MODOS_DE_TEMPO.map((modo) => (
          <button
            key={modo.rotulo}
            type="button"
            role="radio"
            aria-checked={comLimite === modo.com}
            className={comLimite === modo.com ? 'escolhido' : ''}
            onClick={() => {
              setComLimite(modo.com);
              guardarLimiteDeTempo(modo.com);
            }}
          >
            <span className="marcador" aria-hidden="true" />
            <span className="opcao-texto">
              <strong>{modo.rotulo}</strong>
              <small>{modo.descricao}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * A conta de quem está logado: quem é, sair e apagar.
 *
 * A exclusão pede uma segunda confirmação na própria tela, e não num diálogo:
 * o botão que confirma aparece no lugar do que pediu, com o que vai acontecer
 * escrito ao lado. Sem desfazer, a pessoa precisa ler antes de tocar.
 */
export function PainelConta({
  conta,
  conversas,
}: {
  conta: ContaPublica;
  conversas: ConversaResumida[];
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lista, setLista] = useState(conversas);
  /** A conversa cuja exclusão está sendo confirmada. */
  const [apagandoId, setApagandoId] = useState<string | null>(null);
  const [ocupadoConversa, setOcupadoConversa] = useState(false);
  const [erroConversa, setErroConversa] = useState<string | null>(null);

  /**
   * Apagar uma conversa, inclusive as cópias da curadoria.
   *
   * Morava no menu do chat, e saiu de lá para o menu caber em cinco itens.
   * Aqui fica perto de onde a pessoa vê as conversas, uma a uma.
   */
  async function apagarConversa(id: string) {
    setOcupadoConversa(true);
    setErroConversa(null);
    try {
      const resposta = await fetch(`/api/sessoes/${id}`, { method: 'DELETE' });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      setLista((atual) => atual.filter((conversa) => conversa.id !== id));
      setApagandoId(null);
    } catch {
      setErroConversa('Não consegui apagar agora. A conversa continua como estava: tente de novo.');
    } finally {
      setOcupadoConversa(false);
    }
  }

  async function sair() {
    setOcupado(true);
    try {
      await fetch('/api/conta/sair', { method: 'POST' });
    } finally {
      window.location.assign('/staging/entrar');
    }
  }

  async function apagar() {
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await fetch('/api/conta', { method: 'DELETE' });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      window.location.assign('/staging/entrar?apagada=1');
    } catch {
      setErro('Não consegui apagar agora. Sua conta continua como estava: tente de novo.');
      setOcupado(false);
    }
  }

  const criadaEm = dataCurta(conta.criadoEm);

  return (
    <>
      <p className="st-voltar">
        <VoltarParaConversa>← Voltar para a conversa</VoltarParaConversa>
      </p>

      <header className="st-marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/avatar.png" alt="" width={56} height={56} />
        <h1>{conta.nome ? `Olá, ${conta.nome}` : 'Sua conta'}</h1>
      </header>

      <section className="st-cartao">
        <dl className="st-dados">
          <div>
            <dt>E-mail</dt>
            <dd>{conta.email}</dd>
          </div>
          <div>
            <dt>Entra com</dt>
            <dd>
              {[conta.temSenha && 'senha', conta.temGoogle && 'Google'].filter(Boolean).join(' e ')}
            </dd>
          </div>
          <div>
            <dt>Conta criada em</dt>
            <dd>{criadaEm}</dd>
          </div>
        </dl>

        <button type="button" className="st-botao st-botao-secundario" onClick={sair} disabled={ocupado}>
          Sair desta conta
        </button>
      </section>

      <section className="st-cartao">
        <h2>Suas conversas</h2>
        {lista.length === 0 ? (
          <p className="st-dica">Nenhuma conversa ainda. As perguntas que você fizer aparecem aqui.</p>
        ) : (
          <ul className="st-lista-conversas">
            {lista.map((conversa) => (
              <li key={conversa.id} className="st-conversa">
                <a href={conversa.encerrada ? `/staging/conversas/${conversa.id}` : '/staging'}>
                  <span className="st-conversa-pergunta">{conversa.primeiraPergunta}</span>
                  <span className="st-dica">
                    {dataCurta(conversa.iniciadaEm)} ·{' '}
                    {conversa.perguntas} {conversa.perguntas === 1 ? 'pergunta' : 'perguntas'}
                    {conversa.encerrada ? '' : ' · em andamento'}
                  </span>
                </a>
                {apagandoId === conversa.id ? (
                  <div className="st-confirmar-conversa">
                    <p>
                      Apagar esta conversa? Ela sai daqui e das cópias que a equipe guardou.{' '}
                      <strong>Não dá para desfazer.</strong>
                    </p>
                    {erroConversa && (
                      <p className="st-erro" role="alert">
                        {erroConversa}
                      </p>
                    )}
                    <div className="st-acoes">
                      <button
                        type="button"
                        className="st-botao st-botao-secundario"
                        onClick={() => setApagandoId(null)}
                        disabled={ocupadoConversa}
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        className="st-botao st-perigo"
                        onClick={() => void apagarConversa(conversa.id)}
                        disabled={ocupadoConversa}
                      >
                        {ocupadoConversa ? 'Apagando…' : 'Sim, apagar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="st-apagar-conversa"
                    aria-label={`Apagar a conversa: ${conversa.primeiraPergunta ?? dataCurta(conversa.iniciadaEm)}`}
                    onClick={() => {
                      setErroConversa(null);
                      setApagandoId(conversa.id);
                    }}
                  >
                    Apagar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <TempoDeResposta />

      <section className="st-cartao">
        <h2>Privacidade</h2>
        <p>O que fica registrado, por quanto tempo, e como pedir para apagar.</p>
        <Link href="/privacidade?de=staging">Como tratamos seus dados</Link>
      </section>

      <section className="st-cartao st-zona-perigo">
        <h2>Apagar conta</h2>
        {confirmando ? (
          <>
            <p>
              Isto apaga sua conta, todas as suas conversas e as cópias que a equipe guardou para
              melhorar o assistente. <strong>Não dá para desfazer.</strong>
            </p>
            {erro && (
              <p className="st-erro" role="alert">
                {erro}
              </p>
            )}
            <div className="st-acoes">
              <button
                type="button"
                className="st-botao st-botao-secundario"
                onClick={() => setConfirmando(false)}
                disabled={ocupado}
              >
                Voltar
              </button>
              <button type="button" className="st-botao st-perigo" onClick={apagar} disabled={ocupado}>
                {ocupado ? 'Apagando…' : 'Sim, apagar tudo'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Apaga a conta e tudo que está guardado nela.</p>
            <button type="button" className="st-botao st-perigo" onClick={() => setConfirmando(true)}>
              Apagar minha conta
            </button>
          </>
        )}
      </section>
    </>
  );
}

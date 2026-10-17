'use client';

import { useState } from 'react';

import type { ConversaResumida } from '@/lib/conta/conversas';
import type { ContaPublica } from '@/lib/conta/tipos';
import { dataCurta } from '@/lib/datas';

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
        <a href="/staging">← Voltar para a conversa</a>
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
        {conversas.length === 0 ? (
          <p className="st-dica">Nenhuma conversa ainda. As perguntas que você fizer aparecem aqui.</p>
        ) : (
          <ul className="st-lista-conversas">
            {conversas.map((conversa) => (
              <li key={conversa.id}>
                <a href={conversa.encerrada ? `/staging/conversas/${conversa.id}` : '/staging'}>
                  <span className="st-conversa-pergunta">{conversa.primeiraPergunta}</span>
                  <span className="st-dica">
                    {dataCurta(conversa.iniciadaEm)} ·{' '}
                    {conversa.perguntas} {conversa.perguntas === 1 ? 'pergunta' : 'perguntas'}
                    {conversa.encerrada ? '' : ' · em andamento'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
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

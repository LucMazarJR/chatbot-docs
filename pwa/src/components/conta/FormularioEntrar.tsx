'use client';

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';

type Modo = 'entrar' | 'criar';

/**
 * Entrar e criar conta, na mesma tela.
 *
 * Duas abas, e não duas páginas: quem não lembra se já criou conta tenta uma e
 * troca para a outra sem perder o que digitou.
 */
export function FormularioEntrar({
  googleAtivo,
  modoInicial = 'entrar',
}: {
  googleAtivo: boolean;
  modoInicial?: Modo;
}) {
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [aceite, setAceite] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const id = useId();
  const criando = modo === 'criar';

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const resposta = await fetch(criando ? '/api/conta/cadastro' : '/api/conta/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criando ? { email, senha, nome, aceite } : { email, senha }),
      });
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string };

      if (!resposta.ok) {
        setErro(dados.erro ?? 'Não foi possível continuar. Tente de novo.');
        return;
      }

      // Recarrega em vez de navegar pelo cliente: as páginas do staging leem o
      // cookie no servidor, e só uma requisição nova o enxerga.
      window.location.assign('/staging');
    } catch {
      setErro('Sem conexão com o servidor. Confira a internet e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="st-cartao">
      <div className="st-abas" role="tablist" aria-label="Entrar ou criar conta">
        {(['entrar', 'criar'] as const).map((opcao) => (
          <button
            key={opcao}
            type="button"
            role="tab"
            id={`${id}-aba-${opcao}`}
            aria-selected={modo === opcao}
            aria-controls={`${id}-painel`}
            onClick={() => {
              setModo(opcao);
              setErro(null);
            }}
          >
            {opcao === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        ))}
      </div>

      <form
        id={`${id}-painel`}
        role="tabpanel"
        aria-labelledby={`${id}-aba-${modo}`}
        onSubmit={enviar}
        noValidate
      >
        {criando && (
          <div className="st-campo">
            <label htmlFor={`${id}-nome`}>
              Como quer ser chamado <span className="st-dica">(opcional)</span>
            </label>
            <input
              id={`${id}-nome`}
              value={nome}
              maxLength={60}
              autoComplete="given-name"
              onChange={(evento) => setNome(evento.target.value)}
            />
          </div>
        )}

        <div className="st-campo">
          <label htmlFor={`${id}-email`}>E-mail</label>
          <input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
        </div>

        <div className="st-campo">
          <label htmlFor={`${id}-senha`}>Senha</label>
          <input
            id={`${id}-senha`}
            type={mostrarSenha ? 'text' : 'password'}
            autoComplete={criando ? 'new-password' : 'current-password'}
            required
            minLength={criando ? 8 : undefined}
            maxLength={200}
            aria-describedby={criando ? `${id}-dica-senha` : undefined}
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
          />
          {criando && (
            <span id={`${id}-dica-senha`} className="st-dica">
              Ao menos 8 caracteres.
            </span>
          )}
        </div>

        {/* Ver o que digitou importa mais aqui do que num site comum: parte
            de quem vai usar tem dificuldade para enxergar e para acertar a
            tecla no celular. */}
        <label className="st-marcar">
          <input
            type="checkbox"
            checked={mostrarSenha}
            onChange={(evento) => setMostrarSenha(evento.target.checked)}
          />
          <span>Mostrar a senha</span>
        </label>

        {criando && (
          <label className="st-marcar">
            <input
              type="checkbox"
              checked={aceite}
              onChange={(evento) => setAceite(evento.target.checked)}
              required
            />
            <span>
              Aceito que minhas conversas fiquem guardadas na conta para a equipe avaliar as
              respostas, como descrito em{' '}
              <Link href="/privacidade" target="_blank">
                Como tratamos seus dados
              </Link>
              .
            </span>
          </label>
        )}

        {erro && (
          <p className="st-erro" role="alert">
            {erro}
          </p>
        )}

        <button
          type="submit"
          className="st-botao"
          disabled={enviando || !email || !senha || (criando && !aceite)}
        >
          {enviando ? 'Aguarde…' : criando ? 'Criar conta' : 'Entrar'}
        </button>
      </form>

      {googleAtivo && (
        <>
          <p className="st-separador">
            <span>ou</span>
          </p>
          {/* Link, e não fetch: o login do Google é uma sequência de
              redirecionamentos entre sites, que só a navegação completa faz.

              Na aba de criar, o link só existe com o aceite marcado, e leva o
              aceite junto: é o que permite ao retorno criar a conta. Na aba de
              entrar, vai sem aceite e só entra em conta que já existe. */}
          {criando && !aceite ? (
            <p className="st-dica" id={`${id}-dica-google`}>
              Para criar a conta com o Google, marque o aceite dos termos acima.
            </p>
          ) : null}
          <a
            className="st-google"
            href={criando ? (aceite ? '/api/conta/google?aceite=1' : undefined) : '/api/conta/google'}
            aria-disabled={criando && !aceite ? true : undefined}
            aria-describedby={criando && !aceite ? `${id}-dica-google` : undefined}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
            </svg>
            Entrar com Google
          </a>
        </>
      )}
    </section>
  );
}

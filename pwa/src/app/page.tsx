'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Balao, Digitando } from '@/components/Balao';
import { Feedback } from '@/components/Feedback';
import { FolhaAvaliacao } from '@/components/FolhaAvaliacao';
import { RegistrarSW } from '@/components/RegistrarSW';
import { TEXTO_INDISPONIVEL } from '@/lib/mensagens-fixas';
import type { Papel } from '@/lib/tipos';

const INATIVIDADE_MS = 2 * 60 * 1000;
const MINIMO_PERGUNTAS_PARA_AVALIAR = 3;
const CHAVE_SESSAO = 'sessaoId';

type Item = {
  chave: string;
  papel: Papel;
  texto: string;
  hora: string;
  /** Id no banco — só nas respostas do bot, é o alvo do polegar. */
  mensagemId?: string;
  comFeedback?: boolean;
  /** Nas mensagens do participante: dois tiques azuis quando a resposta chegou. */
  lida?: boolean;
};

const ICONE_LOGO = (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.3A10 10 0 1 0 12 2Zm1 14h-2v-3H8v-2h3V8h2v3h3v2h-3v3Z" />
  </svg>
);

function horaAgora(quando: Date = new Date()) {
  return quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function Pagina() {
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [digitando, setDigitando] = useState(false);
  const [avaliando, setAvaliando] = useState(false);
  const [encerrada, setEncerrada] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');

  const listaRef = useRef<HTMLElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const relogioRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const perguntasRef = useRef(0);

  // --- Rolagem -------------------------------------------------------------

  useEffect(() => {
    const lista = listaRef.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [itens, digitando]);

  // --- Inatividade ---------------------------------------------------------

  /**
   * Depois de um tempo parado, oferece a avaliação sozinho.
   *
   * Sem isso, a maioria das sessões terminaria simplesmente fechando a aba, e o
   * protótipo perderia justamente o dado que ele existe para coletar. O piso de
   * perguntas evita abordar quem mal começou a conversar.
   */
  const reiniciarInatividade = useCallback(() => {
    if (relogioRef.current) clearTimeout(relogioRef.current);
    if (encerrada) return;

    relogioRef.current = setTimeout(() => {
      if (perguntasRef.current >= MINIMO_PERGUNTAS_PARA_AVALIAR) setAvaliando(true);
    }, INATIVIDADE_MS);
  }, [encerrada]);

  useEffect(() => () => void (relogioRef.current && clearTimeout(relogioRef.current)), []);

  // --- Retomada depois de um refresh --------------------------------------

  useEffect(() => {
    const salva = sessionStorage.getItem(CHAVE_SESSAO);
    if (!salva) return;

    (async () => {
      try {
        const resposta = await fetch(`/api/sessoes/${salva}/mensagens`);
        if (!resposta.ok) throw new Error('sessão inválida');

        const dados = (await resposta.json()) as {
          nome: string;
          encerrada: boolean;
          mensagens: { _id: string; papel: Papel; texto: string; em: string; erro?: boolean }[];
        };

        if (dados.encerrada) {
          sessionStorage.removeItem(CHAVE_SESSAO);
          return;
        }

        setSessaoId(salva);
        setNome(dados.nome);
        perguntasRef.current = dados.mensagens.filter((m) => m.papel === 'user').length;
        setItens(
          dados.mensagens.map((m) => ({
            chave: m._id,
            papel: m.papel,
            texto: m.texto,
            hora: horaAgora(new Date(m.em)),
            mensagemId: m.papel === 'bot' ? m._id : undefined,
            comFeedback: m.papel === 'bot' && !m.erro,
            lida: m.papel === 'user',
          })),
        );
      } catch {
        sessionStorage.removeItem(CHAVE_SESSAO);
      }
    })();
  }, []);

  // --- Início da conversa --------------------------------------------------

  async function comecar(evento: React.FormEvent) {
    evento.preventDefault();
    setCriando(true);

    try {
      const resposta = await fetch('/api/sessoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      });
      if (!resposta.ok) throw new Error('falha ao criar a sessão');

      const dados = (await resposta.json()) as { sessaoId: string; nome: string };
      sessionStorage.setItem(CHAVE_SESSAO, dados.sessaoId);
      setSessaoId(dados.sessaoId);
      setNome(dados.nome);
      setItens([saudacaoInicial(dados.nome)]);
    } catch {
      setCriando(false);
      alert('Não consegui iniciar a conversa. Verifique a conexão e tente de novo.');
    }
  }

  /**
   * Primeira mensagem local, sem chamar o modelo.
   *
   * É o mesmo texto de saudação que o prompt do agente define, mas escrito
   * aqui: gastar uma chamada ao Gemini (e uma unidade da cota diária) só para
   * dizer "olá" não faria sentido, e o participante veria uma tela vazia
   * enquanto espera.
   */
  function saudacaoInicial(nomeCompleto: string): Item {
    return {
      chave: 'saudacao',
      papel: 'bot',
      hora: horaAgora(),
      texto:
        `Olá, ${nomeCompleto.split(' ')[0]}! 😊 Sou seu assistente de auxílio em saúde.\n` +
        'Posso ajudar com serviços, exames ou dúvidas gerais sobre saúde.\n\n' +
        'Como posso ajudar?',
    };
  }

  // --- Envio ---------------------------------------------------------------

  async function enviar() {
    const pergunta = texto.trim();
    if (!pergunta || !sessaoId || digitando || encerrada) return;

    setTexto('');
    if (campoRef.current) campoRef.current.style.height = 'auto';

    const chaveUsuario = crypto.randomUUID();
    setItens((atuais) => [
      ...atuais,
      { chave: chaveUsuario, papel: 'user', texto: pergunta, hora: horaAgora(), lida: false },
    ]);
    perguntasRef.current += 1;
    setDigitando(true);

    try {
      const resposta = await fetch(`/api/sessoes/${sessaoId}/mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: pergunta }),
      });

      if (resposta.status === 429) {
        adicionarBot('Você enviou muitas mensagens seguidas. Aguarde alguns minutos.', null);
        return;
      }
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

      const dados = (await resposta.json()) as {
        mensagemId: string;
        resposta: string;
        erro: boolean;
      };

      // Um tique cinza vira dois tiques azuis quando a resposta chega.
      setItens((atuais) =>
        atuais.map((item) => (item.chave === chaveUsuario ? { ...item, lida: true } : item)),
      );
      adicionarBot(dados.resposta, dados.erro ? null : dados.mensagemId);
    } catch {
      adicionarBot(TEXTO_INDISPONIVEL, null);
    } finally {
      setDigitando(false);
      reiniciarInatividade();
    }
  }

  function adicionarBot(conteudo: string, mensagemId: string | null) {
    setItens((atuais) => [
      ...atuais,
      {
        chave: mensagemId ?? crypto.randomUUID(),
        papel: 'bot',
        texto: conteudo,
        hora: horaAgora(),
        mensagemId: mensagemId ?? undefined,
        comFeedback: Boolean(mensagemId),
      },
    ]);
  }

  // --- Avaliação -----------------------------------------------------------

  async function enviarAvaliacao(avaliacao: {
    estrelas: number | null;
    nps: number | null;
    comentario: string;
  }) {
    try {
      await fetch(`/api/sessoes/${sessaoId}/avaliacao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(avaliacao),
      });
    } catch {
      // Segue para o agradecimento mesmo assim: cobrar o participante por uma
      // falha de rede nossa seria o pior fim possível para o teste.
    }

    // A sessão foi encerrada no servidor; novas mensagens seriam recusadas.
    setEncerrada(true);
    sessionStorage.removeItem(CHAVE_SESSAO);
    if (relogioRef.current) clearTimeout(relogioRef.current);
  }

  // --- Telas ---------------------------------------------------------------

  if (!sessaoId) {
    return (
      <div id="app">
        <RegistrarSW />
        <section className="tela entrada">
          <div className="entrada-logo">{ICONE_LOGO}</div>

          <h1>Assistente de Saúde</h1>
          <p>Tire dúvidas sobre exames, serviços e unidades de saúde da região.</p>

          <div className="aviso">
            <strong>Antes de começar</strong>
            Este é um <b>protótipo em teste</b>. As mensagens desta conversa são registradas para
            avaliarmos a qualidade das respostas. Por favor, <b>não informe dados pessoais</b> como
            CPF, cartão do SUS, endereço ou informações de saúde que identifiquem você ou outra
            pessoa.
          </div>

          <form onSubmit={comecar}>
            <input
              type="text"
              placeholder="Como podemos te chamar?"
              autoComplete="given-name"
              maxLength={60}
              required
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
            />
            <button className="botao-principal" type="submit" disabled={criando}>
              {criando ? 'Abrindo...' : 'Começar conversa'}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div id="app" onClick={() => setMenuAberto(false)}>
      <RegistrarSW />

      <section className="tela">
        <header className="topo">
          <div className="avatar" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
              <path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.3A10 10 0 1 0 12 2Zm1 14h-2v-3H8v-2h3V8h2v3h3v2h-3v3Z" />
            </svg>
          </div>

          <div className="topo-nome">
            <strong>Assistente de Saúde</strong>
            <span>{digitando ? 'digitando…' : encerrada ? 'conversa encerrada' : 'online'}</span>
          </div>

          <button
            aria-label="Mais opções"
            aria-haspopup="true"
            aria-expanded={menuAberto}
            onClick={(evento) => {
              evento.stopPropagation();
              setMenuAberto((aberto) => !aberto);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </header>

        {menuAberto && (
          <div className="menu">
            <button
              type="button"
              onClick={() => {
                setMenuAberto(false);
                setAvaliando(true);
              }}
            >
              Encerrar e avaliar
            </button>
          </div>
        )}

        <main className="mensagens" ref={listaRef} aria-live="polite" aria-label="Conversa">
          <div className="divisor">
            <span>Hoje</span>
          </div>

          {itens.map((item, indice) => (
            <div key={item.chave}>
              <Balao
                papel={item.papel}
                texto={item.texto}
                hora={item.hora}
                lida={item.lida}
                // O rabinho só aparece no primeiro balão de uma sequência.
                primeira={indice === 0 || itens[indice - 1].papel !== item.papel}
              />
              {item.comFeedback && item.mensagemId && <Feedback mensagemId={item.mensagemId} />}
            </div>
          ))}

          {digitando && <Digitando />}
        </main>

        <footer className="barra-envio">
          <div className="campo">
            <textarea
              ref={campoRef}
              rows={1}
              placeholder={encerrada ? 'Conversa encerrada' : 'Mensagem'}
              enterKeyHint="send"
              maxLength={1000}
              aria-label="Escreva sua mensagem"
              disabled={encerrada}
              value={texto}
              onChange={(evento) => {
                setTexto(evento.target.value);
                // Cresce com o conteúdo, até o teto definido no CSS.
                const campo = evento.target;
                campo.style.height = 'auto';
                campo.style.height = `${campo.scrollHeight}px`;
              }}
              onKeyDown={(evento) => {
                // Enter envia, Shift+Enter quebra linha — como no WhatsApp Web.
                if (evento.key === 'Enter' && !evento.shiftKey) {
                  evento.preventDefault();
                  void enviar();
                }
              }}
            />
          </div>

          <button
            className="enviar"
            aria-label="Enviar"
            disabled={!texto.trim() || digitando || encerrada}
            onClick={() => void enviar()}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7Z" />
            </svg>
          </button>
        </footer>
      </section>

      {avaliando && (
        <FolhaAvaliacao
          onEnviar={enviarAvaliacao}
          onVoltar={() => {
            setAvaliando(false);
            reiniciarInatividade();
          }}
        />
      )}
    </div>
  );
}

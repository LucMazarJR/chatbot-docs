'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { aguardarResposta } from '@/lib/aguardar-resposta';
import { Balao, Digitando } from '@/components/Balao';
import { BotoesRapidos, type BotaoRapido } from '@/components/BotoesRapidos';
import { Feedback } from '@/components/Feedback';
import { FolhaAvaliacao } from '@/components/FolhaAvaliacao';
import { RegistrarSW } from '@/components/RegistrarSW';
import {
  AVISOS_DE_DEMORA,
  MS_PARA_CONSIDERAR_DEMORA,
  TEXTO_DEMOROU_DEMAIS,
  TEXTO_FORA_DO_AR,
} from '@/lib/mensagens-fixas';
import {
  cabecalhosDaSessao,
  esquecerSessao,
  guardarSessao,
  lerSessao,
} from '@/lib/sessao-local';
import type { Papel } from '@/lib/tipos';

const INATIVIDADE_MS = 2 * 60 * 1000;
const MINIMO_PERGUNTAS_PARA_AVALIAR = 3;

/**
 * A sessão fica em `localStorage`, e não em `sessionStorage`.
 *
 * No celular, sair do navegador e voltar depois costuma descartar a aba — com
 * `sessionStorage` a conversa se perderia nesse ir e vir, que é o uso normal de
 * quem está testando o protótipo enquanto conversa com alguém.
 *
 * A leitura e a escrita passam por `lib/sessao-local.ts`, que também guarda a
 * chave da sessão e monta o cabeçalho das chamadas autenticadas.
 */

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
  /** Respostas rápidas sob o balão, no lugar de digitar. */
  botoes?: BotaoRapido[];
  /** O que já foi escolhido: some com os outros e marca este. */
  escolhido?: string;
};

/**
 * Pedido de aceite, antes de qualquer pergunta.
 *
 * O aviso era passivo — um recado no meio da conversa, que dava para ignorar e
 * seguir perguntando. Como o protótipo grava relato de saúde, o consentimento
 * precisa ser um ato: sem tocar em "Aceitar", o campo não envia. E a data fica
 * registrada, o que transforma o aviso em evidência — numa auditoria de LGPD,
 * "avisamos na tela" vale menos que "aceite às 14h31".
 */
const PEDIDO_DE_ACEITE = [
  'Antes de começarmos, preciso do seu aceite. 📋',
  '',
  'Este é um *protótipo em teste*. As mensagens desta conversa ficam registradas para que a equipe avalie a qualidade das respostas.',
  '',
  'Por favor, *não informe dados pessoais* como CPF, cartão do SUS, endereço ou informações de saúde que identifiquem você ou outra pessoa.',
  '',
  'Você aceita continuar nessas condições?',
].join('\n');

const ACEITE_RECUSADO = [
  'Tudo bem, e obrigado por avisar. 🙂',
  '',
  'Sem o aceite eu não posso registrar a conversa, e sem registro não consigo responder. Se mudar de ideia, é só tocar em *Aceitar* acima.',
].join('\n');

const BOTOES_DE_ACEITE: BotaoRapido[] = [
  { rotulo: 'Aceitar', valor: 'aceitar' },
  { rotulo: 'Agora não', valor: 'recusar' },
];

/**
 * Sugestões de partida, numa faixa acima do campo de mensagem.
 *
 * LÓGICA DO LUCIANO: aqui havia uma saudação — "Olá! Sou seu assistente…
 * Como posso ajudar?" — e as sugestões vinham penduradas nela. A saudação saiu.
 * Ela ocupava a primeira tela inteira para dizer o que o cabeçalho já diz, e
 * obrigava a pessoa a ler um parágrafo antes de poder perguntar qualquer coisa.
 * Chat bom abre pronto para receber a pergunta, não para apresentar-se.
 *
 * As sugestões ficaram, porque resolvem um problema medido: no primeiro teste,
 * 8 das 28 conversas marcadas como "não encontrou" eram só "oi" — gente que
 * abriu o chat e não sabia o que pedir. Sem a saudação elas viram o que sempre
 * deveriam ter sido: atalhos ao lado do campo, e não um balão a mais para ler.
 *
 * Somem na primeira pergunta: a partir dali a pessoa já sabe o que fazer, e
 * atalho que não some vira ruído permanente em cima do teclado.
 */
const SUGESTOES: BotaoRapido[] = [
  { rotulo: 'Preparo para exames', valor: 'Como devo me preparar para um exame de sangue?' },
  {
    rotulo: 'Unidades de saúde',
    valor: 'Quais são as unidades de saúde e os horários de atendimento?',
  },
  { rotulo: 'Medicamentos', valor: 'Como funciona a Farmácia Popular?' },
];

function horaAgora(quando: Date = new Date()) {
  return quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function pedidoDeAceite(quando?: Date): Item {
  return {
    chave: 'aceite',
    papel: 'bot',
    texto: PEDIDO_DE_ACEITE,
    hora: horaAgora(quando),
    botoes: BOTOES_DE_ACEITE,
  };
}

/**
 * O texto a mostrar quando a resposta falhou, ou `null` se não falhou.
 *
 * Cada causa muda o que a pessoa deve fazer em seguida: demora pede outra
 * tentativa, serviço fora do ar pede avisar alguém. Dizer "tente novamente em
 * alguns minutos" quando o servidor está desligado seria mentira.
 */
function textoDaFalha(causa: string | null): string | null {
  if (causa === 'demora') return TEXTO_DEMOROU_DEMAIS;
  if (causa === 'fora-do-ar') return TEXTO_FORA_DO_AR;
  return null;
}

export default function Pagina() {
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [falhaAoAbrir, setFalhaAoAbrir] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [digitando, setDigitando] = useState(false);
  const [avaliando, setAvaliando] = useState(false);
  const [encerrada, setEncerrada] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [aceitou, setAceitou] = useState(false);

  const listaRef = useRef<HTMLElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const relogioRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const perguntasRef = useRef(0);
  const abrindoRef = useRef(false);

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

  // --- Abertura: retoma a sessão guardada, ou cria uma nova ----------------

  useEffect(() => {
    // Em desenvolvimento o React monta o componente duas vezes; sem esta trava
    // a primeira visita criaria duas sessões e a segunda ficaria órfã.
    if (abrindoRef.current) return;
    abrindoRef.current = true;

    void (async () => {
      const guardada = lerSessao();
      if (guardada && (await retomar(guardada.id))) return;
      await criarSessao();
    })();
  }, []);

  async function retomar(id: string): Promise<boolean> {
    try {
      const resposta = await fetch(`/api/sessoes/${id}/mensagens`, {
        headers: cabecalhosDaSessao(),
      });
      if (!resposta.ok) throw new Error('sessão inválida');

      const dados = (await resposta.json()) as {
        iniciadaEm: string;
        encerrada: boolean;
        consentimento: boolean;
        mensagens: { _id: string; papel: Papel; texto: string; em: string; erro?: boolean }[];
      };

      // Sessão já avaliada não volta: o participante encerrou de propósito.
      if (dados.encerrada) {
        esquecerSessao();
        return false;
      }

      setSessaoId(id);
      setAceitou(dados.consentimento);
      perguntasRef.current = dados.mensagens.filter((m) => m.papel === 'user').length;

      const inicio = new Date(dados.iniciadaEm);
      setItens([
        // O aceite é local e nunca foi para o banco, então é remontado aqui —
        // com a hora em que a conversa começou, não a do refresh. Quem já
        // aceitou vê o pedido já respondido, e não recebe outro.
        dados.consentimento
          ? { ...pedidoDeAceite(inicio), escolhido: 'aceitar' }
          : pedidoDeAceite(inicio),
        ...dados.mensagens.map((m) => ({
          chave: m._id,
          papel: m.papel,
          texto: m.texto,
          hora: horaAgora(new Date(m.em)),
          mensagemId: m.papel === 'bot' ? m._id : undefined,
          comFeedback: m.papel === 'bot' && !m.erro,
          lida: m.papel === 'user',
        })),
      ]);
      reiniciarInatividade();
      return true;
    } catch {
      esquecerSessao();
      return false;
    }
  }

  async function criarSessao() {
    try {
      const resposta = await fetch('/api/sessoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versao: 'a' }),
      });
      if (!resposta.ok) throw new Error('falha ao criar a sessão');

      // A chave vem só nesta resposta, e não há rota que a devolva depois.
      const dados = (await resposta.json()) as { sessaoId: string; chave?: string };
      guardarSessao({ id: dados.sessaoId, chave: dados.chave });
      setSessaoId(dados.sessaoId);
      setItens([pedidoDeAceite()]);
    } catch {
      setFalhaAoAbrir(true);
    }
  }

  // --- Botões de resposta rápida -------------------------------------------

  /**
   * Marca o botão escolhido e some com os outros.
   *
   * Sem isso, uma conversa retomada mostraria botões já usados, convidando ao
   * clique duplo — e no caso do aceite, a um segundo registro de consentimento.
   */
  function marcarEscolha(chave: string, valor: string) {
    setItens((atuais) =>
      atuais.map((item) => (item.chave === chave ? { ...item, escolhido: valor } : item)),
    );
  }

  async function escolherBotao(item: Item, botao: BotaoRapido) {
    marcarEscolha(item.chave, botao.valor);

    if (item.chave !== 'aceite') {
      // Sugestão de assunto: vale como pergunta digitada.
      void enviarTexto(botao.valor);
      return;
    }

    const aceitando = botao.valor === 'aceitar';
    setAceitou(aceitando);

    // Sem await e sem tratar erro na tela: perder o registro não pode
    // interromper a conversa, e a data serve à equipe, não ao participante.
    if (sessaoId) {
      void fetch(`/api/sessoes/${sessaoId}/consentimento`, {
        method: 'POST',
        headers: cabecalhosDaSessao({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ aceito: aceitando }),
      }).catch(() => {});
    }

    // Aceitou: o campo é liberado e recebe o foco na hora. Nada de saudação —
    // quem acabou de tocar em "Aceitar" quer perguntar, não ser cumprimentado.
    if (aceitando) campoRef.current?.focus();
    else adicionarBot(ACEITE_RECUSADO, null);
  }

  // --- Envio ---------------------------------------------------------------

  function enviar() {
    const pergunta = texto.trim();
    if (!pergunta) return;

    setTexto('');
    if (campoRef.current) campoRef.current.style.height = 'auto';
    void enviarTexto(pergunta);
  }

  async function enviarTexto(pergunta: string) {
    // O aceite é a única porta: sem ele nada é enviado, nem por digitação nem
    // por botão.
    if (!sessaoId || !aceitou || digitando || encerrada) return;

    const chaveUsuario = crypto.randomUUID();
    setItens((atuais) => [
      ...atuais,
      { chave: chaveUsuario, papel: 'user', texto: pergunta, hora: horaAgora(), lida: false },
    ]);
    perguntasRef.current += 1;
    setDigitando(true);

    // Passado um tempo sem resposta, avisa que ainda está trabalhando. Ficar
    // olhando três pontinhos por minutos sem explicação é o que faz alguém
    // fechar a aba — e aí a conversa e a avaliação se perdem junto.
    const iniciouEm = Date.now();
    const avisos = AVISOS_DE_DEMORA.map(({ ms, texto }) =>
      setTimeout(() => adicionarBot(texto, null), ms),
    );

    try {
      const resposta = await fetch(`/api/sessoes/${sessaoId}/mensagens`, {
        method: 'POST',
        headers: cabecalhosDaSessao({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ texto: pergunta }),
      });

      if (resposta.status === 429) {
        adicionarBot('Você enviou muitas mensagens seguidas. Aguarde alguns minutos.', null);
        return;
      }
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

      // O servidor só ACEITA a pergunta e devolve na hora; a resposta fica
      // pronta depois. Um tique cinza vira dois tiques azuis já aqui: a
      // mensagem chegou, é isso que os tiques significam.
      const aceite = (await resposta.json()) as {
        mensagemId: string;
        pendente: boolean;
        erro?: boolean;
        causa?: 'demora' | 'fora-do-ar' | 'indisponivel' | null;
      };

      setItens((atuais) =>
        atuais.map((item) => (item.chave === chaveUsuario ? { ...item, lida: true } : item)),
      );

      // Recusa imediata (n8n fora do ar) nem chega a virar pendência.
      if (!aceite.pendente) {
        adicionarBot(textoDaFalha(aceite.causa ?? null) ?? TEXTO_FORA_DO_AR, null);
        return;
      }

      const pronta = await aguardarResposta(aceite.mensagemId);
      adicionarBot(
        textoDaFalha(pronta.causa) ?? pronta.resposta,
        pronta.erro ? null : aceite.mensagemId,
      );
    } catch {
      // A requisição inteira falhou. Se já tinha passado bastante tempo, o mais
      // provável é a plataforma ter cortado a função no teto dela — isso é
      // demora. Falhando rápido, o servidor do protótipo é que não respondeu.
      const demorou = Date.now() - iniciouEm >= MS_PARA_CONSIDERAR_DEMORA;
      adicionarBot(demorou ? TEXTO_DEMOROU_DEMAIS : TEXTO_FORA_DO_AR, null);
    } finally {
      avisos.forEach(clearTimeout);
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
        headers: cabecalhosDaSessao({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(avaliacao),
      });
    } catch {
      // Segue para o agradecimento mesmo assim: cobrar o participante por uma
      // falha de rede nossa seria o pior fim possível para o teste.
    }

    // A sessão foi encerrada no servidor; novas mensagens seriam recusadas.
    setEncerrada(true);
    esquecerSessao();
    if (relogioRef.current) clearTimeout(relogioRef.current);
  }

  // --- Tela ----------------------------------------------------------------

  // Derivado dos itens, e não de um contador à parte: assim vale igual para a
  // conversa recém-criada e para a retomada do banco, sem um segundo estado
  // para manter em sincronia.
  const mostrarSugestoes =
    aceitou && !encerrada && !itens.some((item) => item.papel === 'user');

  return (
    <div id="app" onClick={() => setMenuAberto(false)}>
      <RegistrarSW />

      <section className="tela">
        <header className="topo">
          {/* Foto no lugar do ícone genérico: o WhatsApp mostra o retrato do
              contato, e um chat de saúde sem rosto parece formulário. */}
          <div className="avatar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/avatar.png" alt="" width={40} height={40} />
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

        {/* LÓGICA DO LUCIANO: eram três itens — "Enviar feedback", "Relatar um
            problema" e "Encerrar e avaliar" — e os três chamavam exatamente a
            mesma folha de avaliação, que encerra a conversa. Três nomes para uma
            ação só, e dois deles mentindo: quem tocava em "Relatar um problema"
            no meio da conversa a encerrava sem querer.

            Sobrou o nome verdadeiro. Relatar problema PONTUAL continua tendo
            caminho, e melhor: o 👎 sob cada resposta, que diz QUAL resposta
            falhou em vez de "a conversa foi ruim". */}
        {menuAberto && (
          <div className="menu" role="menu" aria-label="Opções da conversa">
            <button
              type="button"
              role="menuitem"
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

          {/* No lugar da antiga tela de entrada: o consentimento aparece dentro
              da conversa, como o aviso de criptografia do WhatsApp. Informa sem
              cobrar um formulário de quem só quer fazer uma pergunta. */}
          <div className="aviso-chat">
            Este é um <b>protótipo em teste</b>. As mensagens são registradas para avaliarmos a
            qualidade das respostas. Por favor, <b>não informe dados pessoais</b> como CPF, cartão
            do SUS ou endereço.
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
              {item.botoes && (
                <BotoesRapidos
                  botoes={item.botoes}
                  escolhido={item.escolhido}
                  onEscolher={(botao) => void escolherBotao(item, botao)}
                />
              )}
              {item.comFeedback && item.mensagemId && <Feedback mensagemId={item.mensagemId} />}
            </div>
          ))}

          {digitando && <Digitando />}

          {falhaAoAbrir && <div className="aviso-chat erro">{TEXTO_FORA_DO_AR}</div>}
        </main>

        {mostrarSugestoes && (
          <div className="sugestoes" role="group" aria-label="Sugestões de assunto">
            <BotoesRapidos
              botoes={SUGESTOES}
              onEscolher={(botao) => void enviarTexto(botao.valor)}
            />
          </div>
        )}

        <footer className="barra-envio">
          <div className="campo">
            <textarea
              ref={campoRef}
              rows={1}
              placeholder={
                encerrada
                  ? 'Conversa encerrada'
                  : aceitou
                    ? 'Mensagem'
                    : 'Aceite os termos acima para começar'
              }
              enterKeyHint="send"
              maxLength={1000}
              aria-label="Escreva sua mensagem"
              disabled={encerrada || !sessaoId || !aceitou}
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
            disabled={!texto.trim() || digitando || encerrada || !sessaoId || !aceitou}
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

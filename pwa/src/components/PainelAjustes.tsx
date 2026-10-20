'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import {
  aplicarContraste,
  aplicarEscala,
  aplicarTema,
  ESCALAS,
  lerContraste,
  lerEscala,
  lerTema,
  type Contraste,
  type Escala,
  type Tema,
} from '@/lib/preferencias';
import { useFocoPreso } from '@/lib/usar-foco-preso';
import { useVoltarFecha } from '@/lib/usar-voltar-fecha';
import {
  guardarAutomatica,
  guardarVelocidade,
  lerAutomatica,
  lerVelocidade,
  taxaDeReproducao,
  type Velocidade,
} from '@/lib/leitura-em-voz';
import type { useVozIa } from '@/lib/usar-voz-ia';
import { VOZES } from '@/lib/vozes';
import { soltarAVez, tomarAVez } from '@/lib/som-unico';

const VOZ_IA: { id: 'ligada' | 'desligada'; rotulo: string; descricao: string }[] = [
  {
    id: 'ligada',
    rotulo: 'Ligada',
    descricao: 'Você manda áudio, como no WhatsApp, e ouve as respostas numa voz natural',
  },
  {
    id: 'desligada',
    rotulo: 'Desligada',
    descricao: 'O microfone escreve a pergunta no campo, e as respostas usam a voz do celular',
  },
];

const TEMAS: { id: Tema; rotulo: string; descricao: string }[] = [
  { id: 'claro', rotulo: 'Claro', descricao: 'Fundo branco, melhor sob luz forte' },
  { id: 'escuro', rotulo: 'Escuro', descricao: 'Reduz o brilho da tela' },
  { id: 'auto', rotulo: 'Automático', descricao: 'Segue a configuração do celular' },
];

const CONTRASTES: { id: Contraste; rotulo: string; descricao: string }[] = [
  { id: 'normal', rotulo: 'Normal', descricao: 'As cores do WhatsApp' },
  {
    id: 'alto',
    rotulo: 'Alto',
    descricao: 'Contorno nas mensagens e letras mais fortes. Ajuda em tela fraca ou com sol',
  },
];

const VELOCIDADES: { id: Velocidade; rotulo: string; descricao: string }[] = [
  { id: 'normal', rotulo: 'Normal', descricao: 'Como uma pessoa falando' },
  { id: 'devagar', rotulo: 'Devagar', descricao: 'Mais pausado, para acompanhar com calma' },
];

const LEITURA_AUTOMATICA: { id: 'sim' | 'nao'; rotulo: string; descricao: string }[] = [
  { id: 'nao', rotulo: 'Não', descricao: 'Toque em Ouvir, dentro da resposta, quando quiser' },
  { id: 'sim', rotulo: 'Sim', descricao: 'Cada resposta é lida assim que chega' },
];

/**
 * Uma escolha entre poucas opções, com o desenho de botão de rádio grande.
 *
 * Um lugar só para a marcação dos grupos do painel: com três cópias, a correção
 * de acessibilidade feita num grupo acabaria esquecida nos outros.
 */
function GrupoDeOpcoes<T extends string>({
  id,
  titulo,
  opcoes,
  valor,
  aoMudar,
}: {
  id: string;
  titulo: string;
  opcoes: { id: T; rotulo: string; descricao: string }[];
  valor: T;
  aoMudar: (novo: T) => void;
}) {
  return (
    <section className="painel-secao">
      <h3 id={`rotulo-${id}`}>{titulo}</h3>
      <div role="radiogroup" aria-labelledby={`rotulo-${id}`} className="opcoes-tema">
        {opcoes.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            role="radio"
            aria-checked={valor === opcao.id}
            className={valor === opcao.id ? 'escolhido' : ''}
            onClick={() => aoMudar(opcao.id)}
          >
            <span className="marcador" aria-hidden="true" />
            <span className="opcao-texto">
              <strong>{opcao.rotulo}</strong>
              <small>{opcao.descricao}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Ligar e desligar a voz por IA, e escolher a voz natural.
 *
 * A amostra de cada voz é um arquivo fixo (public/vozes): ouvir as seis antes
 * de escolher gastaria seis das dez falas gratuitas do dia. A voz escolhida
 * vale na próxima resposta tocada, sem fechar o painel.
 */
function EscolhaDaVozIa({ vozIa }: { vozIa: ReturnType<typeof useVozIa> }) {
  const amostraRef = useRef<{ audio: HTMLAudioElement; vez: number } | null>(null);
  const [tocando, setTocando] = useState<string | null>(null);

  function pararAmostra() {
    const amostra = amostraRef.current;
    amostraRef.current = null;
    if (!amostra) return;
    amostra.audio.pause();
    soltarAVez(amostra.vez);
    setTocando(null);
  }

  // Fechar o painel cala a amostra: ela não tem mais botão para parar.
  useEffect(() => pararAmostra, []);

  function ouvirAmostra(nome: string) {
    const repetiu = tocando === nome;
    pararAmostra();
    if (repetiu) return;
    const audio = new Audio(`/vozes/${nome}.mp3`);
    audio.playbackRate = taxaDeReproducao();
    // A amostra para a resposta que estiver tocando na conversa, e o
    // contrário também: duas vozes juntas não deixam comparar nenhuma.
    const vez = tomarAVez(() => {
      audio.pause();
      if (amostraRef.current?.audio === audio) amostraRef.current = null;
      setTocando(null);
    });
    audio.addEventListener('ended', () => {
      soltarAVez(vez);
      if (amostraRef.current?.audio === audio) amostraRef.current = null;
      setTocando(null);
    });
    amostraRef.current = { audio, vez };
    setTocando(nome);
    void audio.play().catch(() => pararAmostra());
  }

  const { estado } = vozIa;
  const aviso =
    estado.motivo === 'sem-chave'
      ? 'A voz por IA não está ligada neste ambiente. O microfone dita a pergunta, e as respostas usam a voz do celular.'
      : !estado.carregando && !estado.audio
        ? 'A voz por IA acabou por hoje e volta amanhã cedo. Até lá, o microfone dita a pergunta e as respostas usam a voz do celular.'
        : !estado.carregando && !estado.vozNatural
          ? 'A voz natural acabou por hoje e volta amanhã cedo. Você ainda pode mandar áudio; as respostas usam a voz do celular.'
          : null;

  return (
    <>
      <GrupoDeOpcoes
        id="voz-ia"
        titulo="Voz por IA (em teste)"
        opcoes={VOZ_IA}
        valor={vozIa.ligada ? 'ligada' : 'desligada'}
        aoMudar={(nova) => vozIa.mudarLigada(nova === 'ligada')}
      />
      {vozIa.ligada && aviso && <p className="painel-sobre aviso-voz">{aviso}</p>}

      {vozIa.ligada && estado.motivo !== 'sem-chave' && (
        <section className="painel-secao">
          <h3 id="rotulo-voz-natural">Voz das respostas</h3>
          <div role="radiogroup" aria-labelledby="rotulo-voz-natural" className="opcoes-tema">
            {VOZES.map((voz) => (
              <div key={voz.nome} className="voz-linha">
                <button
                  type="button"
                  role="radio"
                  aria-checked={vozIa.voz === voz.nome}
                  className={vozIa.voz === voz.nome ? 'escolhido' : ''}
                  onClick={() => vozIa.mudarVoz(voz.nome)}
                >
                  <span className="marcador" aria-hidden="true" />
                  <span className="opcao-texto">
                    <strong>{voz.nome}</strong>
                    <small>{voz.descricao}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="ouvir-amostra"
                  aria-label={tocando === voz.nome ? `Parar a amostra da voz ${voz.nome}` : `Ouvir a voz ${voz.nome}`}
                  aria-pressed={tocando === voz.nome}
                  onClick={() => ouvirAmostra(voz.nome)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    {tocando === voz.nome ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
                  </svg>
                  {tocando === voz.nome ? 'Parar' : 'Ouvir'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/**
 * Ajustes de leitura: tamanho do texto e tema.
 *
 * LÓGICA DO LUCIANO: veio do painel de configurações da versão B, e é a peça de
 * acessibilidade que faltava. O protótipo vai a posto de saúde, onde boa parte
 * de quem vai testar tem presbiopia e usa o telefone com a fonte do sistema no
 * máximo, e este chat ignorava a fonte do sistema, porque mede tudo em px para
 * imitar o WhatsApp. Sem um controle próprio, essas pessoas não conseguiriam ler
 * as respostas que vieram avaliar, e o teste mediria a visão delas em vez da
 * qualidade do assistente.
 *
 * O tamanho vem primeiro, e não o tema, porque é o que resolve o problema de
 * quem não está enxergando: quem abriu este painel por não conseguir ler precisa
 * achar o A+ sem procurar.
 */
export function PainelAjustes({
  aoFechar,
  comVoz = false,
  vozIa,
  comVoltar = false,
  hrefPrivacidade = '/privacidade',
}: {
  aoFechar: () => void;
  /** Staging: o voltar do celular fecha o painel, e não o app. */
  comVoltar?: boolean;
  hrefPrivacidade?: string;
  /** Staging: mostra a velocidade da voz e a leitura automática das respostas. */
  comVoz?: boolean;
  /** Staging: a voz por IA (ligar, desligar e escolher a voz), do gancho da conversa. */
  vozIa?: ReturnType<typeof useVozIa>;
}) {
  const [tema, setTema] = useState<Tema>(() => lerTema());
  const [escala, setEscala] = useState<Escala>(() => lerEscala());
  const [contraste, setContraste] = useState<Contraste>(() => lerContraste());
  const [velocidade, setVelocidade] = useState<Velocidade>(() => lerVelocidade());
  const [automatica, setAutomatica] = useState(() => lerAutomatica());
  const painelRef = useRef<HTMLDivElement>(null);

  const fechar = aoFechar;
  useFocoPreso(painelRef, fechar);
  const camada = useVoltarFecha(true, fechar, comVoltar);

  const indice = ESCALAS.findIndex((e) => e.id === escala.id);

  function mudarEscala(novoIndice: number) {
    const nova = ESCALAS[novoIndice];
    if (!nova) return;
    setEscala(nova);
    aplicarEscala(nova);
  }

  function mudarTema(novo: Tema) {
    setTema(novo);
    aplicarTema(novo);
  }

  function mudarContraste(novo: Contraste) {
    setContraste(novo);
    aplicarContraste(novo);
  }

  return (
    <div className="cortina" onClick={(evento) => evento.target === evento.currentTarget && fechar()}>
      <div
        className="painel-ajustes"
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-ajustes"
      >
        <header className="painel-topo">
          <button type="button" aria-label="Voltar para a conversa" onClick={fechar}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z" />
            </svg>
          </button>
          <h2 id="titulo-ajustes">{comVoz ? 'Letra e voz' : 'Acessibilidade'}</h2>
        </header>

        <div className="painel-corpo">
          <section className="painel-secao">
            <h3 id="rotulo-tamanho">Tamanho do texto</h3>

            <div className="escala-passo">
              <button
                type="button"
                aria-label="Diminuir o texto"
                disabled={indice <= 0}
                onClick={() => mudarEscala(indice - 1)}
              >
                A<span aria-hidden="true">−</span>
              </button>
              {/* `aria-live` aqui, e não nos botões: o que a pessoa precisa
                  ouvir depois de tocar é o tamanho em que ficou. */}
              <span className="escala-atual" aria-live="polite">
                {escala.rotulo}
              </span>
              <button
                type="button"
                aria-label="Aumentar o texto"
                disabled={indice >= ESCALAS.length - 1}
                onClick={() => mudarEscala(indice + 1)}
              >
                A<span aria-hidden="true">+</span>
              </button>
            </div>

            {/* A amostra usa as mesmas medidas do balão da conversa, então o
                efeito aparece aqui exatamente como vai aparecer lá, sem a
                pessoa ter de fechar o painel para descobrir se ficou bom. */}
            <div className="amostra" aria-hidden="true">
              <div className="amostra-balao">
                Preciso fazer jejum para o exame de sangue?
              </div>
            </div>
          </section>

          <GrupoDeOpcoes
            id="tema"
            titulo="Aparência"
            opcoes={TEMAS}
            valor={tema}
            aoMudar={mudarTema}
          />

          {/* A amostra de balão, lá em cima, já mostra o contorno quando o
              contraste alto está ligado. */}
          <GrupoDeOpcoes
            id="contraste"
            titulo="Contraste"
            opcoes={CONTRASTES}
            valor={contraste}
            aoMudar={mudarContraste}
          />

          {comVoz && vozIa && <EscolhaDaVozIa vozIa={vozIa} />}

          {comVoz && (
            <>
              <GrupoDeOpcoes
                id="voz-velocidade"
                titulo="Velocidade da voz"
                opcoes={VELOCIDADES}
                valor={velocidade}
                aoMudar={(nova) => {
                  setVelocidade(nova);
                  guardarVelocidade(nova);
                }}
              />
              <GrupoDeOpcoes
                id="voz-automatica"
                titulo="Ler as respostas sozinho"
                opcoes={LEITURA_AUTOMATICA}
                valor={automatica ? 'sim' : 'nao'}
                aoMudar={(nova) => {
                  setAutomatica(nova === 'sim');
                  guardarAutomatica(nova === 'sim');
                }}
              />
            </>
          )}

          <section className="painel-secao">
            <h3>Sobre este assistente</h3>
            <p className="painel-sobre">
              Este é um <b>protótipo em teste</b>, feito para demonstração e coleta de opiniões.
              As respostas não vêm dos sistemas oficiais e as mensagens desta conversa podem ser
              lidas pela equipe durante os testes.
            </p>
            <p className="painel-sobre">
              Por isso, <b>não compartilhe dados pessoais reais</b>: CPF, RG, cartão do SUS,
              senhas, dados bancários, endereço completo ou informações de saúde suas ou de
              outra pessoa.
            </p>
            <p className="painel-sobre">
              <Link href={hrefPrivacidade} replace={comVoltar} onClick={camada.sair}>
                Como tratamos seus dados
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

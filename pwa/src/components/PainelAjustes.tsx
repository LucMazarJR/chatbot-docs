'use client';

import { useRef, useState } from 'react';
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
import {
  guardarAutomatica,
  guardarVelocidade,
  lerAutomatica,
  lerVelocidade,
  type Velocidade,
} from '@/lib/leitura-em-voz';

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
  { id: 'nao', rotulo: 'Não', descricao: 'Toque em Ouvir embaixo da resposta quando quiser' },
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
}: {
  aoFechar: () => void;
  /** Staging: mostra a velocidade da voz e a leitura automática das respostas. */
  comVoz?: boolean;
}) {
  const [tema, setTema] = useState<Tema>(() => lerTema());
  const [escala, setEscala] = useState<Escala>(() => lerEscala());
  const [contraste, setContraste] = useState<Contraste>(() => lerContraste());
  const [velocidade, setVelocidade] = useState<Velocidade>(() => lerVelocidade());
  const [automatica, setAutomatica] = useState(() => lerAutomatica());
  const painelRef = useRef<HTMLDivElement>(null);

  const fechar = aoFechar;
  useFocoPreso(painelRef, fechar);

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
          <h2 id="titulo-ajustes">Acessibilidade</h2>
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
              <Link href="/privacidade">Como tratamos seus dados</Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

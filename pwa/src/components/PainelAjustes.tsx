'use client';

import { useCallback, useRef, useState } from 'react';

import {
  aplicarEscala,
  aplicarTema,
  ESCALAS,
  lerEscala,
  lerTema,
  type Escala,
  type Tema,
} from '@/lib/preferencias';
import { useFocoPreso } from '@/lib/usar-foco-preso';

const TEMAS: { id: Tema; rotulo: string; descricao: string }[] = [
  { id: 'claro', rotulo: 'Claro', descricao: 'Fundo branco, melhor sob luz forte' },
  { id: 'escuro', rotulo: 'Escuro', descricao: 'Reduz o brilho da tela' },
  { id: 'auto', rotulo: 'Automático', descricao: 'Segue a configuração do celular' },
];

/**
 * Ajustes de leitura: tamanho do texto e tema.
 *
 * LÓGICA DO LUCIANO: veio do painel de configurações da versão B, e é a peça de
 * acessibilidade que faltava. O protótipo vai a posto de saúde, onde boa parte
 * de quem vai testar tem presbiopia e usa o telefone com a fonte do sistema no
 * máximo — e este chat ignorava a fonte do sistema, porque mede tudo em px para
 * imitar o WhatsApp. Sem um controle próprio, essas pessoas não conseguiriam ler
 * as respostas que vieram avaliar, e o teste mediria a visão delas em vez da
 * qualidade do assistente.
 *
 * O tamanho vem primeiro, e não o tema, porque é o que resolve o problema de
 * quem não está enxergando: quem abriu este painel por não conseguir ler precisa
 * achar o A+ sem procurar.
 */
export function PainelAjustes({ aoFechar }: { aoFechar: () => void }) {
  const [tema, setTema] = useState<Tema>(() => lerTema());
  const [escala, setEscala] = useState<Escala>(() => lerEscala());
  const painelRef = useRef<HTMLDivElement>(null);

  // `useCallback` porque o hook do foco depende desta função: sem isso ele
  // religaria o ouvinte de teclado a cada renderização, e cada toque no A+ é
  // uma renderização.
  const fechar = useCallback(() => aoFechar(), [aoFechar]);
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
                efeito aparece aqui exatamente como vai aparecer lá — sem a
                pessoa ter de fechar o painel para descobrir se ficou bom. */}
            <div className="amostra" aria-hidden="true">
              <div className="amostra-balao">
                Preciso fazer jejum para o exame de sangue?
              </div>
            </div>
          </section>

          <section className="painel-secao">
            <h3 id="rotulo-tema">Aparência</h3>
            <div role="radiogroup" aria-labelledby="rotulo-tema" className="opcoes-tema">
              {TEMAS.map((opcao) => (
                <button
                  key={opcao.id}
                  type="button"
                  role="radio"
                  aria-checked={tema === opcao.id}
                  className={tema === opcao.id ? 'escolhido' : ''}
                  onClick={() => mudarTema(opcao.id)}
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
          </section>
        </div>
      </div>
    </div>
  );
}

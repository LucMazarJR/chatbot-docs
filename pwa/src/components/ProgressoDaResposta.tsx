'use client';

import { useEffect, useState } from 'react';

import {
  ETAPAS,
  recadoDaEspera,
  TEXTO_DA_ETAPA,
  trechosDaBarra,
  type EtapaDaResposta,
} from '@/lib/etapas-da-resposta';
import { formatarDuracao } from '@/lib/usar-gravador';

/** De quanto em quanto tempo a barra e o relógio andam. O CSS suaviza o salto entre um passo e outro. */
const PASSO_MS = 400;

/**
 * Quanto o trecho que termina leva para chegar ao fim antes de o seguinte
 * começar. Um pouco acima da transição de `.progresso-trecho i` (0,45 s), para
 * o seguinte só sair quando o anterior já parou.
 */
const CONCLUIR_MS = 500;

/**
 * Quanto o "Pronto" fica na tela antes de a resposta entrar. Sem ele, a barra
 * sumia pela metade, e a espera parecia cortada em vez de concluída. Perto
 * dos 20 a 40 s da espera, a pausa não pesa.
 */
export const MOSTRAR_PRONTO_MS = 700;

const VISTO = (
  <svg viewBox="0 0 16 15" aria-hidden="true">
    <path d="M10.9 3.3 5.8 10 3.1 7.6l-.7.8 3.5 3.1 5.8-7.6z" />
  </svg>
);

/**
 * No lugar do balão de "digitando", uma caixa com a frase da etapa,
 * o tempo de espera ("0:08", como na gravação de áudio) e uma barra em três
 * trechos, um por etapa da resposta. Se a espera passa do comum, uma linha
 * diz que pode demorar e que não precisa enviar de novo; quando a resposta
 * chega, a barra completa e mostra "Pronto".
 *
 * O trecho atual enche devagar e tem um brilho que corre, para a tela nunca
 * parecer parada, e o trecho de uma etapa só completa quando chega o aviso da
 * seguinte.
 */
export function ProgressoDaResposta({ etapa, pronta = false }: { etapa: EtapaDaResposta; pronta?: boolean }) {
  const alvo = ETAPAS.indexOf(etapa);
  const [relogio, setRelogio] = useState(() => {
    const agora = Date.now();
    return { comecouEm: agora, agora };
  });
  // A barra mostra uma etapa de cada vez, atrás da que chegou do fluxo: o
  // trecho que termina corre até o fim antes de o seguinte começar, e uma
  // etapa que a consulta de 2 s pulou inteira também passa pela barra.
  const [mostrada, setMostrada] = useState({ indice: alvo, desde: relogio.comecouEm });
  const concluindo = alvo > mostrada.indice;

  useEffect(() => {
    const passo = setInterval(() => setRelogio((atual) => ({ ...atual, agora: Date.now() })), PASSO_MS);
    return () => clearInterval(passo);
  }, []);

  useEffect(() => {
    if (!concluindo) return;
    const espera = setTimeout(
      () => setMostrada((atual) => ({ indice: atual.indice + 1, desde: Date.now() })),
      CONCLUIR_MS,
    );
    return () => clearTimeout(espera);
  }, [concluindo, mostrada.indice]);

  const nome = ETAPAS[mostrada.indice];
  const esperou = relogio.agora - relogio.comecouEm;
  const trechos = pronta
    ? ETAPAS.map(() => 1)
    : trechosDaBarra(nome, Math.max(0, relogio.agora - mostrada.desde), concluindo);
  const recado = pronta ? null : recadoDaEspera(esperou);

  return (
    <div className="linha entrada-linha digitando">
      <div className="progresso">
        {/* `aria-hidden`: quem anuncia a etapa é o cabeçalho, que é role="status".
            Sem isto os dois falariam, e o leitor de tela leria o relógio a
            cada segundo. */}
        <div className="progresso-topo" aria-hidden="true">
          {/* A chave muda com a etapa: a frase nova entra deslizando, em vez de trocar seca. */}
          {pronta ? (
            <span key="pronta" className="progresso-frase progresso-pronta">
              {VISTO}
              Pronto
            </span>
          ) : (
            <span key={nome} className="progresso-frase">
              {TEXTO_DA_ETAPA[nome]}
            </span>
          )}
          <span className="progresso-tempo">{formatarDuracao(Math.floor(esperou / 1000))}</span>
        </div>
        <div className="progresso-trilho" aria-hidden="true">
          {ETAPAS.map((trecho, indice) => (
            <span
              key={trecho}
              className={indice === mostrada.indice && !pronta ? 'progresso-trecho atual' : 'progresso-trecho'}
            >
              <i style={{ width: `${trechos[indice] * 100}%` }} />
            </span>
          ))}
        </div>
        {/* Fora do `aria-hidden`, e como status: este recado muda o que a
            pessoa faz (não reenviar), e quem usa leitor de tela precisa
            ouvi-lo também. Existe desde o início, vazio, para o leitor
            anunciar quando o texto chegar. */}
        <div className={recado ? 'progresso-calma aberta' : 'progresso-calma'} role="status">
          <p>
            <span>{recado ?? ''}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

'use client';

export type BotaoRapido = { rotulo: string; valor: string };

/**
 * Botões de resposta rápida sob um balão do bot.
 *
 * Vieram do desenho da versão B, e resolvem duas coisas de uma vez: o aceite
 * dos termos vira um toque em vez de digitação, e quem abre o chat sem saber o
 * que perguntar tem por onde começar — no primeiro teste, 8 das 28 conversas
 * marcadas como "não encontrou" eram só "oi", gente sem saber o que pedir.
 *
 * Somem depois de escolhido, e a escolha fica aparente no balão: sem isso, uma
 * conversa retomada mostraria botões já usados, convidando ao clique duplo.
 */
export function BotoesRapidos({
  botoes,
  escolhido,
  onEscolher,
}: {
  botoes: BotaoRapido[];
  escolhido?: string;
  onEscolher: (botao: BotaoRapido) => void;
}) {
  return (
    <div className="botoes-rapidos">
      {botoes.map((botao) => {
        const foiEste = escolhido === botao.valor;
        if (escolhido && !foiEste) return null;

        return (
          <button
            key={botao.valor}
            type="button"
            disabled={Boolean(escolhido)}
            className={foiEste ? 'escolhido' : ''}
            onClick={() => onEscolher(botao)}
          >
            {botao.rotulo}
          </button>
        );
      })}
    </div>
  );
}

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { rotuloCompleto, rotuloDoIntervalo } from "@/lib/intervalos";
import type { SerieUbs } from "@/lib/ubs.functions";

/**
 * Conversas ao longo do tempo: uma série só, o total de todas as unidades.
 *
 * LÓGICA DO LUCIANO: uma linha por unidade foi descartada. Com a lista de 30
 * unidades, seriam 30 linhas cruzadas, e nenhuma paleta separa tantas cores para
 * quem não enxerga todas elas (as cores de gráfico do painel falham no teste de
 * daltonismo já com quatro). A evolução de cada unidade aparece na própria linha
 * dela no ranking, numa minilinha de uma cor só: comparar unidades vira ler a
 * lista de cima para baixo, sem depender de cor nenhuma.
 */

const config: ChartConfig = { conversas: { label: "Conversas", color: "var(--chart-1)" } };

const conversasTexto = (n: number) =>
  `${n.toLocaleString("pt-BR")} ${n === 1 ? "conversa" : "conversas"}`;

export function EvolucaoConversas({ serie }: { serie: SerieUbs }) {
  const pontos = serie.intervalos.map((intervalo, i) => ({
    intervalo,
    rotulo: rotuloDoIntervalo(intervalo, serie.granularidade),
    conversas: serie.total[i] ?? 0,
  }));
  const soma = pontos.reduce((t, p) => t + p.conversas, 0);
  const pico = pontos.reduce((maior, p) => (p.conversas > maior.conversas ? p : maior), pontos[0]);
  const porQue = { hora: "por hora", dia: "por dia", semana: "por semana" }[serie.granularidade];

  return (
    <section className="space-y-3" aria-labelledby="titulo-evolucao">
      <div>
        <h2 id="titulo-evolucao" className="text-lg font-semibold">
          Conversas ao longo do tempo
        </h2>
        <p className="text-sm text-muted-foreground">
          Conversas com pelo menos uma pergunta, {porQue}, em todas as unidades. A evolução de cada
          unidade está na linha dela, em Conversas por unidade.
        </p>
      </div>

      {soma === 0 || !pico ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Nenhuma conversa neste período. Escolha outro período acima.
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <ChartContainer
            config={config}
            className="aspect-auto h-56 w-full"
            role="img"
            aria-label={`Gráfico de linha: ${conversasTexto(soma)} no período, com o maior movimento em ${rotuloCompleto(pico.intervalo, serie.granularidade)} (${conversasTexto(pico.conversas)}). Os números estão na tabela abaixo.`}
          >
            <LineChart data={pontos} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} strokeDasharray="0" />
              <XAxis
                dataKey="rotulo"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={40}
                tickMargin={4}
              />
              <ChartTooltip
                cursor={{ strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const ponto = active ? payload?.[0]?.payload : null;
                  if (!ponto) return null;
                  return (
                    <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-md">
                      <p className="text-muted-foreground">
                        {rotuloCompleto(ponto.intervalo, serie.granularidade)}
                      </p>
                      <p className="font-semibold text-foreground">
                        {conversasTexto(ponto.conversas)}
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                dataKey="conversas"
                type="monotone"
                stroke="var(--color-conversas)"
                strokeWidth={2}
                // Marcador só quando há poucos pontos: com dezenas, viram uma
                // fileira de bolinhas que esconde a linha.
                dot={pontos.length <= 14 ? { r: 4, strokeWidth: 2, fill: "var(--card)" } : false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>

          <details className="mt-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">
              Ver os números em tabela
            </summary>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Quando</th>
                    <th className="py-1 text-right font-medium">Conversas</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {pontos.map((p) => (
                    <tr key={p.intervalo} className="border-t border-border">
                      <td className="py-1 pr-3">
                        {rotuloCompleto(p.intervalo, serie.granularidade)}
                      </td>
                      <td className="py-1 text-right">{p.conversas.toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

/**
 * A evolução de uma unidade, na linha dela do ranking.
 *
 * Cada minilinha tem a própria escala: serve para ver a forma (subindo,
 * parada, um pico só), e o número de conversas está escrito ao lado. Uma linha
 * reta no fundo marca o zero, para "parada" não parecer "sem dado".
 */
export function Minilinha({
  valores,
  descricao,
}: {
  valores: number[];
  /** O que a minilinha mostra, em palavras, para o leitor de tela e a dica. */
  descricao: string;
}) {
  if (valores.length < 2) return null;
  const largura = 120;
  const altura = 28;
  const maior = Math.max(1, ...valores);
  const x = (i: number) => (i / (valores.length - 1)) * (largura - 4) + 2;
  const y = (v: number) => altura - 3 - (v / maior) * (altura - 6);
  const caminho = valores
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const ultimo = valores.length - 1;

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      width={largura}
      height={altura}
      role="img"
      aria-label={descricao}
      className="shrink-0 text-primary"
    >
      <title>{descricao}</title>
      <line
        x1={2}
        x2={largura - 2}
        y1={altura - 3}
        y2={altura - 3}
        className="stroke-border"
        strokeWidth={1}
      />
      <path
        d={caminho}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(ultimo)} cy={y(valores[ultimo])} r={2.5} fill="currentColor" />
    </svg>
  );
}

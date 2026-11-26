import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, ListPlus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Carregando } from "@/components/carregando";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { CartaoNumero } from "@/components/cartao-numero";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { GateShell, usePode } from "@/components/gate";
import { Segmentos } from "@/components/segmentos";
import { Selo, type TomDoSelo } from "@/components/selo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EvolucaoConversas, Minilinha } from "@/components/evolucao-conversas";
import { rotuloCompleto } from "@/lib/intervalos";
import { RodapeDaPagina } from "@/components/rodape-da-pagina";
import { diaEHora } from "@/lib/datas";
import { POR_PAGINA, usePaginaLocal } from "@/lib/paginacao";
import { exigirPermissao } from "@/lib/guardas";
import {
  corrigirGrafia,
  criarUbs,
  criarUbsEmLote,
  descartarGrafia,
  obterPainelUbs,
  removerUbs,
  renomearUbs,
  type ComoIdentificou,
  type Grafia,
  type LinhaUbs,
  type PainelUbs,
  type PeriodoUbs,
  type ResultadoDoLote,
} from "@/lib/ubs.functions";

export const Route = createFileRoute("/unidades")({
  beforeLoad: () => exigirPermissao("unidades"),
  head: () => ({ meta: [{ title: "Unidades de saúde | Central de FAQs" }] }),
  component: UbsPage,
});

const PERIODOS: { valor: PeriodoUbs; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "tudo", rotulo: "Tudo" },
];

const COMO: Record<"revisar" | ComoIdentificou, { rotulo: string; tom: TomDoSelo }> = {
  revisar: { rotulo: "Não reconhecido", tom: "atencao" },
  lista: { rotulo: "Escolhida na lista", tom: "sucesso" },
  aproximada: { rotulo: "Parecido", tom: "neutro" },
  corrigida: { rotulo: "Ensinado pela equipe", tom: "marca" },
  nome: { rotulo: "Nome certo", tom: "sucesso" },
};

/**
 * Uma ação de cada vez, num diálogo só.
 *
 * Um diálogo ou Select do Radix por linha trava o clique da página inteira (ver
 * Dashboard-PetSaude/CLAUDE.md). Por isso a linha só diz o que abrir, e a escolha
 * da unidade usa o select nativo, que no celular abre a lista do próprio aparelho.
 */
type Acao =
  | { tipo: "nova" }
  | { tipo: "varias" }
  | { tipo: "renomear"; ubs: LinhaUbs }
  | { tipo: "remover"; ubs: LinhaUbs }
  | { tipo: "corrigir"; grafia: Grafia }
  | { tipo: "descartar"; grafia: Grafia };

const numero = (valor: number) => valor.toLocaleString("pt-BR");
const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;

function UbsPage() {
  const [periodo, setPeriodo] = useState<PeriodoUbs>("tudo");
  const [acao, setAcao] = useState<Acao | null>(null);
  // Quem só vê acompanha os números: sem `aoEscolher`, as listas saem sem os
  // botões de corrigir, renomear e remover.
  const podeEditar = usePode("unidades", "editar");
  const escolher = podeEditar ? setAcao : undefined;

  const painel = useQuery({
    queryKey: ["ubs-painel", periodo],
    queryFn: () => obterPainelUbs({ data: { periodo } }),
    // O front publica antes do back: por alguns minutos o back antigo responde
    // sem estes números, e a tela não pode quebrar por isso.
    select: (dados): PainelUbs => ({
      ...dados,
      geral: dados.geral ?? GERAL_VAZIO,
      serie: dados.serie ?? SERIE_VAZIA,
      porUbs: dados.porUbs.map((u) => ({ ...u, temas: u.temas ?? [] })),
    }),
  });

  return (
    <GateShell>
      <div className="space-y-6">
        <CabecalhoPagina
          titulo="Unidades de saúde"
          frase="O chat pergunta em qual unidade de saúde a pessoa está e mostra as unidades cadastradas aqui para ela escolher. Quem escreve um nome que não está na lista aparece em Para identificar, e o sistema reconhece sozinho os nomes parecidos, mesmo com erro de digitação."
          acoes={
            podeEditar && (
              <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" onClick={() => setAcao({ tipo: "nova" })}>
                  <Plus aria-hidden="true" className="size-4" /> Nova unidade
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setAcao({ tipo: "varias" })}
                >
                  <ListPlus aria-hidden="true" className="size-4" /> Adicionar várias
                </Button>
              </div>
            )
          }
        />

        <Segmentos rotulo="Período" opcoes={PERIODOS} valor={periodo} aoMudar={setPeriodo} />

        {painel.isError ? (
          <EstadoFalha onTentarDeNovo={() => painel.refetch()} tentando={painel.isFetching}>
            Não foi possível carregar os números das unidades. Confira a internet e tente de novo.
          </EstadoFalha>
        ) : !painel.data ? (
          <Carregando texto="Carregando os números das unidades…" />
        ) : (
          <>
            <Numeros dados={painel.data} />
            <ParaIdentificar
              grafias={painel.data.grafias.filter((g) => g.como === null)}
              aoEscolher={escolher}
            />
            <EvolucaoConversas serie={painel.data.serie} />
            <Ranking dados={painel.data} />
            <ComoFoiReconhecido
              grafias={painel.data.grafias.filter((g) => g.como !== null)}
              aoEscolher={escolher}
            />
            <ListaDeUbs linhas={painel.data.porUbs} aoEscolher={escolher} />
          </>
        )}
      </div>

      {acao && (
        <DialogoDaAcao
          acao={acao}
          unidades={painel.data?.porUbs ?? []}
          aoFechar={() => setAcao(null)}
        />
      )}
    </GateShell>
  );
}

const GERAL_VAZIO: PainelUbs["geral"] = {
  conversas: 0,
  perguntas: 0,
  semResposta: 0,
  negativos: 0,
  positivos: 0,
  avaliacoes: 0,
  notaMedia: null,
  ultimaEm: null,
  percentual: 0,
  percentualSemResposta: null,
};

const SERIE_VAZIA: PainelUbs["serie"] = {
  granularidade: "dia",
  intervalos: [],
  total: [],
  porUnidade: {},
};

const porcento = (valor: number) => `${valor.toLocaleString("pt-BR")}%`;

const informaram = (n: number) =>
  n === 0 ? "todas informaram" : `${numero(n)} não ${n === 1 ? "informou" : "informaram"}`;

function Numeros({ dados }: { dados: PainelUbs }) {
  const participando = dados.porUbs.filter((u) => u.conversas > 0).length;
  const cobertura = dados.conversas
    ? Math.round((dados.identificadas / dados.conversas) * 100)
    : null;
  const semResposta = dados.geral.percentualSemResposta;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5">
        <CartaoNumero
          rotulo="Conversas"
          valor={numero(dados.conversas)}
          contexto={plural(dados.geral.perguntas, "pergunta feita", "perguntas feitas")}
        />
        <CartaoNumero
          rotulo="Unidades participando"
          valor={`${numero(participando)} de ${numero(dados.porUbs.length)}`}
          contexto="com ao menos uma conversa"
        />
        <CartaoNumero
          rotulo="Com unidade conhecida"
          valor={cobertura != null ? `${cobertura}%` : "sem conversas"}
          tom={dados.paraRevisar > 0 ? "warning" : undefined}
          contexto={
            dados.paraRevisar > 0
              ? `${plural(dados.paraRevisar, "espera", "esperam")} identificação · ${informaram(dados.naoInformaram)}`
              : `${informaram(dados.naoInformaram)} a unidade`
          }
        />
        <CartaoNumero
          rotulo="Sem resposta"
          valor={semResposta != null ? porcento(semResposta) : "nenhuma"}
          tom={(semResposta ?? 0) >= 30 ? "warning" : undefined}
          contexto="das perguntas, em todas as unidades"
        />
      </div>
      {dados.anteriores > 0 && (
        <p className="text-sm text-muted-foreground">
          {plural(dados.anteriores, "conversa é anterior", "conversas são anteriores")} à pergunta
          da unidade: {dados.anteriores === 1 ? "conta" : "contam"} no total, mas em nenhuma
          unidade.
        </p>
      )}
    </div>
  );
}

/**
 * Taxa de sem resposta que pede atenção: bem acima da geral, e com perguntas
 * suficientes para não ser acaso. Duas perguntas sem resposta em três dão 67%,
 * e isso não diz nada sobre a unidade.
 */
function acimaDaMedia(linha: LinhaUbs, geral: number | null) {
  return (
    linha.perguntas >= 5 &&
    linha.percentualSemResposta != null &&
    linha.percentualSemResposta >= (geral ?? 0) + 10
  );
}

/**
 * Uma série só, de magnitude: um tom, barra fina ancorada no zero e o valor
 * escrito na linha. A lista já é a tabela, então nada depende só da cor.
 */
type OrdemDoRanking = "conversas" | "sem-resposta" | "nota";

const ORDENS: { valor: OrdemDoRanking; rotulo: string }[] = [
  { valor: "conversas", rotulo: "Mais conversas" },
  { valor: "sem-resposta", rotulo: "Mais sem resposta" },
  { valor: "nota", rotulo: "Menor nota" },
];

/**
 * A ordem da lista. Sem resposta e nota deixam no fim quem não tem o dado
 * (nenhuma pergunta, nenhuma avaliação): no topo, pareceriam a pior unidade.
 * O empate fica com quem teve mais conversas, que é o número mais confiável.
 */
function ordenar(linhas: LinhaUbs[], ordem: OrdemDoRanking): LinhaUbs[] {
  const porConversas = (a: LinhaUbs, b: LinhaUbs) => b.conversas - a.conversas;
  if (ordem === "conversas") return [...linhas].sort(porConversas);
  if (ordem === "sem-resposta") {
    return [...linhas].sort(
      (a, b) =>
        (b.percentualSemResposta ?? -1) - (a.percentualSemResposta ?? -1) || porConversas(a, b),
    );
  }
  return [...linhas].sort(
    (a, b) => (a.notaMedia ?? Infinity) - (b.notaMedia ?? Infinity) || porConversas(a, b),
  );
}

function Ranking({ dados }: { dados: PainelUbs }) {
  const [ordem, setOrdem] = useState<OrdemDoRanking>("conversas");
  const ativas = ordenar(
    dados.porUbs.filter((u) => u.conversas > 0),
    ordem,
  );
  const paradas = dados.porUbs.filter((u) => u.conversas === 0);
  const maior = Math.max(1, ...ativas.map((u) => u.conversas));
  const geral = dados.geral.percentualSemResposta;
  const { serie } = dados;

  return (
    <section className="space-y-3" aria-labelledby="titulo-ranking">
      <div>
        <h2 id="titulo-ranking" className="text-lg font-semibold">
          Conversas por unidade
        </h2>
        <p className="text-sm text-muted-foreground">
          Sem resposta é a parte das perguntas em que o assistente não achou o que responder. Em
          todas as unidades, ficou em {geral != null ? porcento(geral) : "zero"}. Os temas são as
          categorias das FAQs usadas nas respostas, e a linha ao lado do nome é a evolução da
          unidade no período.
        </p>
      </div>

      {ativas.length > 1 && (
        <Segmentos rotulo="Ordenar unidades por" opcoes={ORDENS} valor={ordem} aoMudar={setOrdem} />
      )}

      {ativas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma conversa com unidade identificada neste período">
          Quando alguém informar a unidade e fizer uma pergunta, ela aparece aqui.
        </EstadoVazio>
      ) : (
        <ol className="space-y-1 rounded-xl border border-border bg-card p-2 sm:p-3">
          {ativas.map((ubs) => {
            const alerta = acimaDaMedia(ubs, geral);
            const evolucao = serie.porUnidade[ubs.id] ?? [];
            const picoIndice = evolucao.indexOf(Math.max(...evolucao, 0));
            return (
              <li key={ubs.id} className="space-y-1.5 rounded-lg px-2 py-2.5 sm:px-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <strong className="min-w-0 font-semibold">{ubs.nome}</strong>
                    <Minilinha
                      valores={evolucao}
                      descricao={`Evolução de ${ubs.nome}: ${plural(ubs.conversas, "conversa", "conversas")} no período${
                        picoIndice >= 0 && evolucao[picoIndice] > 0
                          ? `, com mais movimento em ${rotuloCompleto(serie.intervalos[picoIndice], serie.granularidade)}`
                          : ""
                      }.`}
                    />
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    <strong className="text-base font-semibold">{numero(ubs.conversas)}</strong>{" "}
                    {ubs.conversas === 1 ? "conversa" : "conversas"}
                    <span className="text-muted-foreground"> · {porcento(ubs.percentual)}</span>
                  </span>
                </div>
                <div aria-hidden="true" className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.max(2, (ubs.conversas / maior) * 100)}%` }}
                  />
                </div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span>{plural(ubs.perguntas, "pergunta", "perguntas")}</span>
                  <span aria-hidden="true">·</span>
                  <span className={alerta ? "font-medium text-warning" : undefined}>
                    {ubs.percentualSemResposta != null
                      ? `${porcento(ubs.percentualSemResposta)} sem resposta`
                      : "sem perguntas"}
                  </span>
                  {alerta && (
                    <Selo tom="atencao" icone={<AlertTriangle aria-hidden="true" />}>
                      Acima da média
                    </Selo>
                  )}
                  {ubs.negativos > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{plural(ubs.negativos, "voto negativo", "votos negativos")}</span>
                    </>
                  )}
                  {ubs.notaMedia != null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        nota {ubs.notaMedia.toLocaleString("pt-BR")} em{" "}
                        {plural(ubs.avaliacoes, "avaliação", "avaliações")}
                      </span>
                    </>
                  )}
                  {ubs.ultimaEm && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>última em {diaEHora(ubs.ultimaEm)}</span>
                    </>
                  )}
                </p>
                {ubs.temas.length > 0 && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Temas: </span>
                    {ubs.temas.map((t) => `${t.categoria} (${numero(t.respostas)})`).join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {paradas.length > 0 && ativas.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            Sem conversas no período ({numero(paradas.length)}):
          </span>{" "}
          {paradas.map((u) => u.nome).join(", ")}.
        </p>
      )}
    </section>
  );
}

function ParaIdentificar({
  grafias,
  aoEscolher,
}: {
  grafias: Grafia[];
  aoEscolher?: (acao: Acao) => void;
}) {
  // Sem pendência, uma linha só: a caixa inteira empurraria o ranking para baixo,
  // e não dizer nada deixava a dúvida se havia algo a fazer.
  if (grafias.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
        Nada para identificar: o sistema reconheceu todos os nomes que chegaram.
      </p>
    );
  }
  return <ParaIdentificarLista grafias={grafias} aoEscolher={aoEscolher} />;
}

// Separado para o hook de página não ficar depois do retorno antecipado acima.
function ParaIdentificarLista({
  grafias,
  aoEscolher,
}: {
  grafias: Grafia[];
  aoEscolher?: (acao: Acao) => void;
}) {
  const conversas = grafias.reduce((total, g) => total + g.vezes, 0);
  const pagina = usePaginaLocal(grafias);

  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-warning-soft p-4 sm:p-5"
      aria-labelledby="titulo-identificar"
    >
      <div>
        <h2 id="titulo-identificar" className="text-lg font-semibold">
          Para identificar
        </h2>
        <p className="text-sm text-muted-foreground">
          O sistema não reconheceu {plural(grafias.length, "nome", "nomes")}, de{" "}
          {plural(conversas, "conversa", "conversas")}.{" "}
          {aoEscolher
            ? "Escolha a unidade certa e ele aprende aquele jeito de escrever: as conversas passam a contar, inclusive as antigas."
            : "Quem tem Unidades para editar no grupo escolhe a unidade certa, e o sistema aprende aquele jeito de escrever."}
        </p>
      </div>
      <ul className="overflow-hidden rounded-lg border border-border bg-card">
        {pagina.itens.map((grafia) => (
          <LinhaGrafia key={grafia.chave} grafia={grafia} aoEscolher={aoEscolher} />
        ))}
      </ul>
      <RodapeDaPagina
        pagina={pagina.page}
        porPagina={POR_PAGINA}
        quantos={pagina.itens.length}
        total={pagina.total}
        totalPaginas={pagina.totalPages}
        aoMudar={pagina.setPage}
      />
    </section>
  );
}

function ComoFoiReconhecido({
  grafias,
  aoEscolher,
}: {
  grafias: Grafia[];
  aoEscolher?: (acao: Acao) => void;
}) {
  const pagina = usePaginaLocal(grafias);
  if (grafias.length === 0) return null;
  const aproximadas = grafias.filter((g) => g.como === "aproximada").length;

  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span>
          <span className="font-semibold">Nomes que o sistema reconheceu</span>
          <span className="block text-sm text-muted-foreground">
            {plural(grafias.length, "jeito de escrever", "jeitos de escrever")}
            {aproximadas > 0 ? `, ${numero(aproximadas)} por semelhança.` : "."}
            {aoEscolher && " Se algum foi para a unidade errada, corrija aqui."}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <ul className="border-t border-border">
        {pagina.itens.map((grafia) => (
          <LinhaGrafia key={grafia.chave} grafia={grafia} aoEscolher={aoEscolher} />
        ))}
      </ul>
      {pagina.totalPages > 1 && (
        <div className="border-t border-border px-4 py-2 sm:px-5">
          <RodapeDaPagina
            pagina={pagina.page}
            porPagina={POR_PAGINA}
            quantos={pagina.itens.length}
            total={pagina.total}
            totalPaginas={pagina.totalPages}
            aoMudar={pagina.setPage}
          />
        </div>
      )}
    </details>
  );
}

function LinhaGrafia({
  grafia,
  aoEscolher,
}: {
  grafia: Grafia;
  aoEscolher?: (acao: Acao) => void;
}) {
  const como = COMO[grafia.como ?? "revisar"];
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:px-5">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="font-semibold break-words">{grafia.texto}</strong>
          <Selo tom={como.tom}>{como.rotulo}</Selo>
        </div>
        <p className="text-sm text-muted-foreground">
          {grafia.ubsNome ? `${grafia.ubsNome} · ` : ""}
          {plural(grafia.vezes, "conversa", "conversas")}
        </p>
      </div>
      {/* Nome certo não tem o que corrigir: é o nome oficial. Para mudar, renomeia-se a unidade. */}
      {aoEscolher && grafia.como !== "nome" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => aoEscolher({ tipo: "corrigir", grafia })}
          >
            {grafia.ubsId ? "Corrigir" : "Escolher unidade"}
          </Button>
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => aoEscolher({ tipo: "descartar", grafia })}
          >
            Não é uma unidade
          </Button>
        </div>
      )}
    </li>
  );
}

function ListaDeUbs({
  linhas,
  aoEscolher,
}: {
  linhas: LinhaUbs[];
  aoEscolher?: (acao: Acao) => void;
}) {
  const emOrdem = [...linhas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span>
          <span className="font-semibold">Lista de unidades de saúde</span>
          <span className="block text-sm text-muted-foreground">
            {plural(linhas.length, "unidade reconhecida", "unidades reconhecidas")} pelo chat.
            {aoEscolher && " Renomeie ou remova aqui."}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      {emOrdem.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground sm:px-5">
          {aoEscolher
            ? "A lista está vazia. Use Adicionar várias, no topo, para cadastrar as unidades."
            : "A lista está vazia."}
        </p>
      ) : (
        <ul className="border-t border-border">
          {emOrdem.map((ubs) => (
            <li
              key={ubs.id}
              className="flex items-center justify-between gap-2 border-b border-border px-4 py-1 last:border-b-0 sm:px-5"
            >
              <span className="min-w-0 truncate">{ubs.nome}</span>
              {aoEscolher && (
                <span className="flex shrink-0">
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    aria-label={`Renomear ${ubs.nome}`}
                    onClick={() => aoEscolher({ tipo: "renomear", ubs })}
                  >
                    Renomear
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    aria-label={`Remover ${ubs.nome}`}
                    onClick={() => aoEscolher({ tipo: "remover", ubs })}
                  >
                    Remover
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

const TITULOS: Record<Acao["tipo"], string> = {
  nova: "Nova unidade de saúde",
  varias: "Adicionar várias unidades",
  renomear: "Renomear unidade",
  remover: "Remover unidade",
  corrigir: "Qual é a unidade certa?",
  descartar: "Isto não é uma unidade de saúde?",
};

const CONFIRMACOES: Record<Acao["tipo"], string> = {
  nova: "Adicionar",
  varias: "Adicionar todas",
  renomear: "Salvar",
  remover: "Remover",
  corrigir: "Salvar",
  descartar: "Apagar o texto",
};

function DialogoDaAcao({
  acao,
  unidades,
  aoFechar,
}: {
  acao: Acao;
  unidades: LinhaUbs[];
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState(acao.tipo === "renomear" ? acao.ubs.nome : "");
  const [ubsId, setUbsId] = useState(acao.tipo === "corrigir" ? (acao.grafia.ubsId ?? "") : "");
  const [aviso, setAviso] = useState("");
  /** Adicionar várias: o texto colado, uma unidade por linha. */
  const [linhas, setLinhas] = useState("");
  /** O que o lote fez. O diálogo fica aberto para a pessoa ler o que não entrou. */
  const [resultado, setResultado] = useState<ResultadoDoLote | null>(null);
  const nomesDasLinhas = linhas
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const salvar = useMutation({
    mutationFn: async () => {
      if (acao.tipo === "varias") {
        const feito = await criarUbsEmLote({ data: { nomes: nomesDasLinhas } });
        setResultado(feito);
        return;
      }
      if (acao.tipo === "nova") await criarUbs({ data: { nome } });
      if (acao.tipo === "renomear") await renomearUbs({ data: { id: acao.ubs.id, nome } });
      if (acao.tipo === "remover") await removerUbs({ data: { id: acao.ubs.id } });
      if (acao.tipo === "corrigir")
        await corrigirGrafia({ data: { chave: acao.grafia.chave, ubsId } });
      if (acao.tipo === "descartar") await descartarGrafia({ data: { chave: acao.grafia.chave } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ubs-painel"] });
      // No lote, o resultado aparece no próprio diálogo: um aviso que some
      // sozinho não daria tempo de ler quais linhas ficaram de fora.
      if (acao.tipo === "varias") return;
      toast.success("Pronto, os números já foram atualizados.");
      aoFechar();
    },
    onError: (erro: Error) =>
      setAviso(erro.message || "Não foi possível salvar. Confira a internet e tente de novo."),
  });

  function confirmar() {
    // O botão fica sempre ativo: dizer o que falta é melhor que apagá-lo.
    if (acao.tipo === "corrigir" && !ubsId) return setAviso("Escolha uma unidade da lista.");
    if (acao.tipo === "corrigir" && ubsId === acao.grafia.ubsId) {
      return setAviso(
        `"${acao.grafia.texto}" já conta para a ${acao.grafia.ubsNome}. Para mudar, escolha outra unidade.`,
      );
    }
    if ((acao.tipo === "nova" || acao.tipo === "renomear") && nome.trim().length < 2) {
      return setAviso("Escreva o nome da unidade.");
    }
    if (acao.tipo === "varias" && nomesDasLinhas.length === 0) {
      return setAviso("Cole ou escreva os nomes, um por linha.");
    }
    if (acao.tipo === "varias" && nomesDasLinhas.length > 200) {
      return setAviso(
        `São ${nomesDasLinhas.length} linhas. Envie até 200 de cada vez: divida a lista em partes.`,
      );
    }
    setAviso("");
    salvar.mutate();
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITULOS[acao.tipo]}</DialogTitle>
          <DialogDescription>
            {acao.tipo === "nova" &&
              "Ela entra na lista do chat, e o sistema passa a reconhecê-la também nas conversas antigas."}
            {acao.tipo === "varias" &&
              "Cole a lista com uma unidade por linha. As que já estão na lista são puladas, e as novas entram na lista do chat."}
            {acao.tipo === "renomear" &&
              "Quem escreveu o nome antigo continua contando nesta unidade."}
            {acao.tipo === "remover" &&
              `${acao.ubs.nome} sai da lista, e as conversas dela voltam para "Para identificar".`}
            {acao.tipo === "corrigir" &&
              (acao.grafia.ubsNome
                ? `Alguém escreveu "${acao.grafia.texto}" no chat, e o sistema entendeu ${acao.grafia.ubsNome}. Escolha a unidade certa.`
                : `Alguém escreveu "${acao.grafia.texto}" no chat. Escolha a unidade a que isso se refere.`)}
            {acao.tipo === "descartar" &&
              `"${acao.grafia.texto}" será apagado de ${plural(acao.grafia.vezes, "conversa", "conversas")}, que passam a contar como não informadas. Não dá para desfazer.`}
          </DialogDescription>
        </DialogHeader>

        {(acao.tipo === "nova" || acao.tipo === "renomear") && (
          <div className="space-y-2">
            <Label htmlFor="nome-ubs">Nome da unidade</Label>
            <Input
              id="nome-ubs"
              value={nome}
              maxLength={60}
              onChange={(e) => {
                setNome(e.target.value);
                setAviso("");
              }}
            />
          </div>
        )}

        {acao.tipo === "corrigir" && (
          <div className="space-y-2">
            <Label htmlFor="escolha-ubs">Unidade de saúde</Label>
            <select
              id="escolha-ubs"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-[15px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={ubsId}
              onChange={(e) => {
                setUbsId(e.target.value);
                setAviso("");
              }}
            >
              <option value="">Escolha uma unidade</option>
              {[...unidades]
                .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                .map((ubs) => (
                  <option key={ubs.id} value={ubs.id}>
                    {ubs.nome}
                  </option>
                ))}
            </select>
          </div>
        )}

        {acao.tipo === "varias" && !resultado && (
          <div className="space-y-2">
            <Label htmlFor="lista-de-unidades">Uma unidade por linha</Label>
            <textarea
              id="lista-de-unidades"
              rows={10}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={"UBS Aeroporto I\nESF Palma\nUBS Santa Clara"}
              value={linhas}
              onChange={(e) => {
                setLinhas(e.target.value);
                setAviso("");
              }}
            />
            <p className="text-sm text-muted-foreground">
              {nomesDasLinhas.length === 0
                ? "Nenhum nome ainda."
                : `${plural(nomesDasLinhas.length, "nome", "nomes")} para adicionar.`}
            </p>
          </div>
        )}

        {resultado && <ResultadoDoLoteNaTela resultado={resultado} />}

        {aviso && (
          <p role="alert" className="text-sm text-destructive">
            {aviso}
          </p>
        )}

        {resultado ? (
          <DialogFooter>
            <Button className="min-h-11" onClick={aoFechar}>
              Fechar
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button
              className="min-h-11"
              variant={
                acao.tipo === "remover" || acao.tipo === "descartar" ? "destructive" : "default"
              }
              disabled={salvar.isPending}
              onClick={confirmar}
            >
              {salvar.isPending ? "Salvando…" : CONFIRMACOES[acao.tipo]}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** O que entrou, o que já estava e o que ficou de fora, com o motivo de cada uma. */
function ResultadoDoLoteNaTela({ resultado }: { resultado: ResultadoDoLote }) {
  const { criadas, jaExistiam, recusadas } = resultado;
  return (
    <div className="space-y-3 text-[15px]" role="status">
      <p className="flex items-center gap-2 font-semibold">
        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
        {criadas.length === 0
          ? "Nenhuma unidade nova entrou."
          : `${plural(criadas.length, "unidade entrou", "unidades entraram")} na lista do chat.`}
      </p>
      {jaExistiam.length > 0 && (
        <div>
          <p className="text-muted-foreground">
            {plural(jaExistiam.length, "já estava", "já estavam")} na lista e{" "}
            {jaExistiam.length === 1 ? "ficou" : "ficaram"} como estava:
          </p>
          <p>{jaExistiam.join(", ")}.</p>
        </div>
      )}
      {recusadas.length > 0 && (
        <div className="rounded-lg border border-border bg-warning-soft p-3">
          <p className="font-medium">
            {plural(recusadas.length, "linha ficou", "linhas ficaram")} de fora. Corrija o nome e
            adicione de novo:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {recusadas.map((r) => (
              <li key={r.nome}>
                “{r.nome}”: {r.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

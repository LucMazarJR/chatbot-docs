import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CalendarCheck, Pencil } from "lucide-react";
import { toast } from "sonner";

import { GateShell } from "@/components/gate";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Carregando } from "@/components/carregando";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { FaqPagination } from "@/components/faq-pagination";
import { FaqFormDialog, SeloRevisao, faqCategories } from "@/components/faq-shared";
import { Segmentos } from "@/components/segmentos";
import { Selo } from "@/components/selo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dataCurta } from "@/lib/datas";
import { listarRevisoes, revisarFaq, type Faq, type FiltroRevisao } from "@/lib/faq.functions";
import { exigirPermissao } from "@/lib/guardas";
import { PRAZOS, diaPorExtenso, hoje, somarDias, textoDaRevisao } from "@/lib/revisao";

export const Route = createFileRoute("/revisoes")({
  beforeLoad: () => exigirPermissao("revisoes"),
  head: () => ({ meta: [{ title: "Revisões | Central de FAQs" }] }),
  component: RevisoesPage,
});

function RevisoesPage() {
  return (
    <GateShell>
      <PainelRevisoes />
    </GateShell>
  );
}

/** Qual ação está aberta, e para qual FAQ. Um diálogo por vez, montado sob demanda. */
type Acao = { tipo: "valendo" | "editar"; faq: Faq } | null;

/**
 * As FAQs com data de revisão: as que venceram, as dos próximos 30 dias, ou
 * todas.
 *
 * Revisar é conferir se continua valendo e marcar a próxima data, ou corrigir o
 * texto. Dá para fazer antes de vencer; o diálogo só avisa que o prazo ainda
 * não chegou, porque às vezes a informação muda antes do previsto.
 */
function PainelRevisoes() {
  const [situacao, setSituacao] = useState<FiltroRevisao>("vencidas");
  const [escopo, setEscopo] = useState<"todas" | "minhas">("todas");
  const [page, setPage] = useState(1);
  const [acao, setAcao] = useState<Acao>(null);

  const lista = useQuery({
    queryKey: ["revisoes", situacao, escopo, page],
    queryFn: () => listarRevisoes({ data: { situacao, escopo, page } }),
    placeholderData: keepPreviousData,
  });

  const contagem = lista.data?.contagem;
  const opcoes: { valor: FiltroRevisao; rotulo: string }[] = [
    { valor: "vencidas", rotulo: contagem ? `Vencidas (${contagem.vencidas})` : "Vencidas" },
    {
      valor: "proximas",
      rotulo: contagem ? `Próximos 30 dias (${contagem.proximas})` : "Próximos 30 dias",
    },
    { valor: "todas", rotulo: contagem ? `Todas com data (${contagem.todas})` : "Todas com data" },
  ];

  const mudarSituacao = (nova: FiltroRevisao) => {
    setSituacao(nova);
    setPage(1);
  };

  const fechar = () => setAcao(null);
  const avisoDePrazo =
    acao && acao.faq.situacao_revisao !== "vencida" && acao.faq.revisar_em
      ? `Esta FAQ ainda não venceu: a revisão está marcada para ${dataCurta(acao.faq.revisar_em)}. Dá para revisar antes, se a informação já mudou.`
      : undefined;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Revisões"
        frase={
          // O número só com a resposta: "nenhuma vencida" durante a espera
          // diria que não há nada para revisar.
          contagem
            ? contagem.vencidas === 0
              ? "Nenhuma FAQ passou da data de revisão."
              : `${contagem.vencidas === 1 ? "1 FAQ passou" : `${contagem.vencidas} FAQs passaram`} da data de revisão. O chatbot continua respondendo com elas até alguém revisar.`
            : "As FAQs que alguém marcou para conferir numa data, como as de um surto ou de uma campanha."
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Segmentos
          rotulo="Quais revisões"
          opcoes={opcoes}
          valor={situacao}
          aoMudar={mudarSituacao}
        />
        {lista.data?.podeVerTodas && (
          <Segmentos
            rotulo="De quem"
            opcoes={[
              { valor: "todas", rotulo: "De todos" },
              { valor: "minhas", rotulo: "Só as minhas" },
            ]}
            valor={escopo}
            aoMudar={(novo) => {
              setEscopo(novo);
              setPage(1);
            }}
          />
        )}
      </div>

      {lista.data && !lista.data.podeVerTodas && (
        <p className="text-sm text-muted-foreground">
          O seu grupo revisa as FAQs que você criou. As dos colegas ficam com quem revisa todas.
        </p>
      )}

      {lista.isError ? (
        <EstadoFalha onTentarDeNovo={() => lista.refetch()} tentando={lista.isFetching}>
          Não foi possível carregar as revisões. Confira a internet e tente de novo.
        </EstadoFalha>
      ) : !lista.data ? (
        <Carregando texto="Carregando as revisões…" />
      ) : lista.data.items.length === 0 ? (
        <EstadoVazio
          titulo={
            situacao === "vencidas"
              ? "Nenhuma FAQ vencida"
              : situacao === "proximas"
                ? "Nada vence nos próximos 30 dias"
                : "Nenhuma FAQ com data de revisão"
          }
        >
          {situacao === "todas"
            ? "Para uma FAQ aparecer aqui, marque Precisa de revisão em uma data ao criar ou editar a pergunta."
            : "As outras FAQs com data estão em Todas com data."}
        </EstadoVazio>
      ) : (
        <>
          <ul className="space-y-3">
            {lista.data.items.map((faq) => (
              <CartaoRevisao
                key={faq.id}
                faq={faq}
                aoConfirmar={() => setAcao({ tipo: "valendo", faq })}
                aoEditar={() => setAcao({ tipo: "editar", faq })}
              />
            ))}
          </ul>
          <FaqPagination
            page={lista.data.page}
            totalPages={lista.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {acao?.tipo === "valendo" && (
        <DialogoContinuaValendo faq={acao.faq} aviso={avisoDePrazo} aoFechar={fechar} />
      )}
      {acao?.tipo === "editar" && (
        <FaqFormDialog
          mode="edit"
          faq={acao.faq}
          open
          onOpenChange={(aberto) => {
            if (!aberto) fechar();
          }}
          aviso={avisoDePrazo}
        />
      )}
    </div>
  );
}

function CartaoRevisao({
  faq,
  aoConfirmar,
  aoEditar,
}: {
  faq: Faq;
  aoConfirmar: () => void;
  aoEditar: () => void;
}) {
  const [assunto] = faqCategories(faq);
  return (
    <li className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SeloRevisao faq={faq} />
        {assunto && <Selo tom="marca">{assunto}</Selo>}
      </div>
      <Link
        to="/faqs/$id"
        params={{ id: faq.id }}
        className="mt-2 block break-words text-base font-semibold hover:underline"
      >
        {faq.question}
      </Link>
      <p className="mt-1 line-clamp-3 break-words text-[15px] text-muted-foreground">
        {faq.answer}
      </p>
      {faq.revisao_nota && (
        <p className="mt-2 break-words text-sm">
          <span className="font-semibold">Motivo:</span> {faq.revisao_nota}
        </p>
      )}
      <p className="mt-2 text-[13px] text-muted-foreground">
        {faq.created_by ? `Criada por ${faq.created_by}` : "Sem registro de autor"}
        {faq.revisada_por && faq.revisada_em
          ? ` · revisada por ${faq.revisada_por} em ${dataCurta(faq.revisada_em)}`
          : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={aoConfirmar}>
          <CalendarCheck /> Continua valendo
        </Button>
        <Button variant="outline" onClick={aoEditar}>
          <Pencil /> Editar
        </Button>
      </div>
    </li>
  );
}

/**
 * "Continua valendo": quem revisou marca a próxima data, ou diz que a FAQ não
 * precisa mais de revisão. Não mexe no texto: para isso é o Editar.
 */
function DialogoContinuaValendo({
  faq,
  aviso,
  aoFechar,
}: {
  faq: Faq;
  aviso?: string;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const revisar = useServerFn(revisarFaq);
  const [semRevisao, setSemRevisao] = useState(false);
  const [data, setData] = useState(somarDias(hoje(), 90));
  const [nota, setNota] = useState(faq.revisao_nota ?? "");
  const [tentou, setTentou] = useState(false);

  const mutacao = useMutation({
    mutationFn: () =>
      revisar({
        data: {
          id: faq.id,
          revisar_em: semRevisao ? null : data,
          revisao_nota: semRevisao ? null : nota.trim() || null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["revisoes"] });
      await queryClient.invalidateQueries({ queryKey: ["revisoes-contagem"] });
      await queryClient.invalidateQueries({ queryKey: ["faqs"] });
      toast.success(
        semRevisao
          ? "Revisada. A FAQ não precisa mais de revisão."
          : `Revisada. A próxima revisão é em ${diaPorExtenso(data)}.`,
      );
      aoFechar();
    },
    onError: (erro: Error) =>
      toast.error(
        erro.message || "Não foi possível salvar a revisão. Confira a internet e tente de novo.",
      ),
  });

  const faltaData = !semRevisao && data === "";

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Continua valendo</DialogTitle>
          <DialogDescription className="break-words">{faq.question}</DialogDescription>
        </DialogHeader>

        {aviso && (
          <p className="rounded-lg bg-warning-soft p-3 text-[15px] text-foreground">{aviso}</p>
        )}

        <Label
          htmlFor="sem-revisao"
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3"
        >
          <Checkbox
            id="sem-revisao"
            checked={semRevisao}
            onCheckedChange={(v) => setSemRevisao(v === true)}
          />
          <span className="font-normal">Não precisa mais de revisão</span>
        </Label>

        {!semRevisao && (
          <>
            <div className="space-y-2">
              <Label htmlFor="proxima-revisao">Próxima revisão</Label>
              <Input
                id="proxima-revisao"
                type="date"
                value={data}
                min={hoje()}
                onChange={(e) => setData(e.target.value)}
                className="w-auto"
                aria-invalid={tentou && faltaData}
              />
              <div className="flex flex-wrap gap-2">
                {PRAZOS.map((prazo) => (
                  <Button
                    key={prazo.dias}
                    type="button"
                    variant="secondary"
                    onClick={() => setData(somarDias(hoje(), prazo.dias))}
                  >
                    {prazo.rotulo}
                  </Button>
                ))}
              </div>
              {tentou && faltaData ? (
                <p className="text-sm font-semibold text-destructive">
                  Escolha a data da próxima revisão, ou marque que não precisa mais.
                </p>
              ) : (
                data && <p className="text-sm text-muted-foreground">{textoDaRevisao(data)}.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="motivo-revisao">Motivo (opcional)</Label>
              <Input
                id="motivo-revisao"
                value={nota}
                maxLength={200}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ex.: surto de Hepatite A em Franca"
              />
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={mutacao.isPending}
            onClick={() => {
              setTentou(true);
              if (!faltaData) mutacao.mutate();
            }}
          >
            {mutacao.isPending ? "Salvando…" : "Salvar revisão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

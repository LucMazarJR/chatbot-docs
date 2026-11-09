import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Carregando } from "@/components/carregando";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { CartaoNumero } from "@/components/cartao-numero";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { GateShell } from "@/components/gate";
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
import { exigirAdmin } from "@/lib/guardas";
import {
  corrigirGrafia,
  criarUbs,
  descartarGrafia,
  obterPainelUbs,
  removerUbs,
  renomearUbs,
  type ComoIdentificou,
  type Grafia,
  type LinhaUbs,
  type PainelUbs,
  type PeriodoUbs,
} from "@/lib/ubs.functions";

export const Route = createFileRoute("/ubs")({
  beforeLoad: () => exigirAdmin(),
  head: () => ({ meta: [{ title: "UBS | Central de FAQs" }] }),
  component: UbsPage,
});

const PERIODOS: { valor: PeriodoUbs; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "tudo", rotulo: "Tudo" },
];

const COMO: Record<"revisar" | ComoIdentificou, { rotulo: string; tom: TomDoSelo }> = {
  revisar: { rotulo: "Não reconhecida", tom: "atencao" },
  aproximada: { rotulo: "Aproximada", tom: "neutro" },
  corrigida: { rotulo: "Corrigida", tom: "marca" },
  nome: { rotulo: "Nome exato", tom: "sucesso" },
};

/**
 * Uma ação de cada vez, num diálogo só.
 *
 * Um diálogo ou Select do Radix por linha trava o clique da página inteira (ver
 * Dashboard-PetSaude/CLAUDE.md). Por isso a linha só diz o que abrir, e a escolha
 * da UBS usa o select nativo, que no celular abre a lista do próprio aparelho.
 */
type Acao =
  | { tipo: "nova" }
  | { tipo: "renomear"; ubs: LinhaUbs }
  | { tipo: "remover"; ubs: LinhaUbs }
  | { tipo: "corrigir"; grafia: Grafia }
  | { tipo: "descartar"; grafia: Grafia };

const numero = (valor: number) => valor.toLocaleString("pt-BR");
const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;

function UbsPage() {
  const [periodo, setPeriodo] = useState<PeriodoUbs>("tudo");
  const [acao, setAcao] = useState<Acao | null>(null);

  const painel = useQuery({
    queryKey: ["ubs-painel", periodo],
    queryFn: () => obterPainelUbs({ data: { periodo } }),
  });

  return (
    <GateShell>
      <div className="space-y-6">
        <CabecalhoPagina
          titulo="UBS"
          frase="De quais unidades vêm as conversas do chat, mesmo com o nome escrito de jeitos diferentes."
          acoes={
            <Button className="min-h-11" onClick={() => setAcao({ tipo: "nova" })}>
              <Plus aria-hidden="true" className="size-4" /> Nova UBS
            </Button>
          }
        />

        <Segmentos rotulo="Período" opcoes={PERIODOS} valor={periodo} aoMudar={setPeriodo} />

        {painel.isError ? (
          <EstadoFalha onTentarDeNovo={() => painel.refetch()} tentando={painel.isFetching}>
            Não foi possível carregar os números das UBS. Confira a internet e tente de novo.
          </EstadoFalha>
        ) : !painel.data ? (
          <Carregando texto="Carregando os números das UBS…" />
        ) : (
          <>
            <Numeros dados={painel.data} />
            <Grafias grafias={painel.data.grafias} aoEscolher={setAcao} />
            <PorUbs linhas={painel.data.porUbs} aoEscolher={setAcao} />
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

function Numeros({ dados }: { dados: PainelUbs }) {
  const responderam = dados.identificadas + dados.paraRevisar;
  const reconhecidas = responderam ? Math.round((dados.identificadas / responderam) * 100) : null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5">
        <CartaoNumero
          rotulo="Conversas"
          valor={numero(dados.conversas)}
          contexto={plural(dados.identificadas, "com UBS reconhecida", "com UBS reconhecida")}
        />
        <CartaoNumero
          rotulo="Reconhecidas"
          valor={reconhecidas != null ? `${reconhecidas}%` : "nenhuma"}
          contexto="de quem escreveu o nome da UBS"
        />
        <CartaoNumero
          rotulo="Para identificar"
          valor={numero(dados.paraRevisar)}
          tom={dados.paraRevisar > 0 ? "warning" : undefined}
          contexto="conversas com nome não reconhecido"
        />
        <CartaoNumero
          rotulo="Não informaram"
          valor={numero(dados.naoInformaram)}
          contexto="tocaram em Pular ou já perguntaram"
        />
      </div>
      {dados.anteriores > 0 && (
        <p className="text-sm text-muted-foreground">
          {plural(dados.anteriores, "conversa é anterior", "conversas são anteriores")} à pergunta
          da UBS e {dados.anteriores === 1 ? "não entra" : "não entram"} nestas contas.
        </p>
      )}
    </div>
  );
}

function Grafias({ grafias, aoEscolher }: { grafias: Grafia[]; aoEscolher: (acao: Acao) => void }) {
  return (
    <section className="space-y-3" aria-labelledby="titulo-grafias">
      <div>
        <h2 id="titulo-grafias" className="text-lg font-semibold">
          O que as pessoas escreveram
        </h2>
        <p className="text-sm text-muted-foreground">
          Ao apontar a UBS certa, o sistema aprende aquela grafia, e as conversas antigas também
          passam a contar.
        </p>
      </div>

      {grafias.length === 0 ? (
        <EstadoVazio titulo="Ninguém escreveu o nome de uma UBS ainda">
          Quando alguém responder à pergunta no começo do chat, o texto aparece aqui.
        </EstadoVazio>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {grafias.map((grafia) => {
            const como = COMO[grafia.como ?? "revisar"];
            return (
              <li
                key={grafia.chave}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-semibold break-words">{grafia.texto}</strong>
                    <Selo tom={como.tom}>{como.rotulo}</Selo>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {grafia.ubsNome ? `${grafia.ubsNome} · ` : ""}
                    {plural(grafia.vezes, "vez", "vezes")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => aoEscolher({ tipo: "corrigir", grafia })}
                  >
                    {grafia.ubsId ? "Corrigir" : "Escolher UBS"}
                  </Button>
                  {grafia.como !== "nome" && (
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      onClick={() => aoEscolher({ tipo: "descartar", grafia })}
                    >
                      Não é UBS
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PorUbs({ linhas, aoEscolher }: { linhas: LinhaUbs[]; aoEscolher: (acao: Acao) => void }) {
  return (
    <section className="space-y-3" aria-labelledby="titulo-por-ubs">
      <div>
        <h2 id="titulo-por-ubs" className="text-lg font-semibold">
          Conversas por UBS
        </h2>
        <p className="text-sm text-muted-foreground">
          O percentual é sobre as conversas com UBS reconhecida.
        </p>
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio titulo="A lista de UBS está vazia">
          Use Nova UBS para cadastrar as unidades.
        </EstadoVazio>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {linhas.map((ubs) => (
            <li
              key={ubs.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:px-5"
            >
              <div className="min-w-0">
                <strong className="font-semibold">{ubs.nome}</strong>
                <p className="text-sm text-muted-foreground">
                  {plural(ubs.conversas, "conversa", "conversas")} ·{" "}
                  {plural(ubs.perguntas, "pergunta", "perguntas")} ·{" "}
                  {ubs.percentual.toLocaleString("pt-BR")}%
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TITULOS: Record<Acao["tipo"], string> = {
  nova: "Nova UBS",
  renomear: "Renomear UBS",
  remover: "Remover UBS",
  corrigir: "Qual é a UBS?",
  descartar: "Isto não é uma UBS?",
};

const CONFIRMACOES: Record<Acao["tipo"], string> = {
  nova: "Adicionar",
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

  const salvar = useMutation({
    mutationFn: async () => {
      if (acao.tipo === "nova") await criarUbs({ data: { nome } });
      if (acao.tipo === "renomear") await renomearUbs({ data: { id: acao.ubs.id, nome } });
      if (acao.tipo === "remover") await removerUbs({ data: { id: acao.ubs.id } });
      if (acao.tipo === "corrigir")
        await corrigirGrafia({ data: { chave: acao.grafia.chave, ubsId } });
      if (acao.tipo === "descartar") await descartarGrafia({ data: { chave: acao.grafia.chave } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ubs-painel"] });
      toast.success("Pronto, os números já foram atualizados.");
      aoFechar();
    },
    onError: (erro: Error) =>
      setAviso(erro.message || "Não foi possível salvar. Confira a internet e tente de novo."),
  });

  function confirmar() {
    // O botão fica sempre ativo: dizer o que falta é melhor que apagá-lo.
    if (acao.tipo === "corrigir" && !ubsId) return setAviso("Escolha uma UBS da lista.");
    if ((acao.tipo === "nova" || acao.tipo === "renomear") && nome.trim().length < 2) {
      return setAviso("Escreva o nome da UBS.");
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
              "O chat passa a reconhecer esta unidade também nas conversas antigas."}
            {acao.tipo === "renomear" &&
              "Quem escreveu o nome antigo continua contando nesta unidade."}
            {acao.tipo === "remover" &&
              `${acao.ubs.nome} sai da lista, e as conversas dela voltam para "Para identificar".`}
            {acao.tipo === "corrigir" && `Alguém escreveu "${acao.grafia.texto}" no chat.`}
            {acao.tipo === "descartar" &&
              `"${acao.grafia.texto}" será apagado de ${plural(acao.grafia.vezes, "conversa", "conversas")}, que passam a contar como não informadas. Não dá para desfazer.`}
          </DialogDescription>
        </DialogHeader>

        {(acao.tipo === "nova" || acao.tipo === "renomear") && (
          <div className="space-y-2">
            <Label htmlFor="nome-ubs">Nome da UBS</Label>
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
            <Label htmlFor="escolha-ubs">UBS</Label>
            <select
              id="escolha-ubs"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-[15px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={ubsId}
              onChange={(e) => {
                setUbsId(e.target.value);
                setAviso("");
              }}
            >
              <option value="">Escolha uma UBS</option>
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

        {aviso && (
          <p role="alert" className="text-sm text-destructive">
            {aviso}
          </p>
        )}

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
      </DialogContent>
    </Dialog>
  );
}

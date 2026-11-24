import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { GateShell, useSession } from "@/components/gate";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Carregando } from "@/components/carregando";
import { Selo } from "@/components/selo";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { atualizarPerfil, type SessionStatus } from "@/lib/auth.functions";
import { exigirSessao } from "@/lib/guardas";
import { DESTINOS, GRUPOS } from "@/lib/navegacao";
import { INFO_AREA, pode, rotuloDoNivel } from "@/lib/permissoes";
import { PRAZOS, textoDoPrazo } from "@/lib/revisao";

export const Route = createFileRoute("/conta")({
  beforeLoad: () => exigirSessao(),
  head: () => ({ meta: [{ title: "Minha conta | Central de FAQs" }] }),
  component: ContaPage,
});

function ContaPage() {
  return (
    <GateShell>
      <MinhaConta />
    </GateShell>
  );
}

type Usuario = NonNullable<SessionStatus["user"]>;

/**
 * O que é da própria pessoa: o nome, o que o grupo dela abre e as
 * preferências. Qualquer conta abre, seja qual for o grupo.
 *
 * E-mail e grupo aparecem, mas não se mudam aqui: o e-mail é o login, e o grupo
 * é o acesso, e os dois ficam com quem cuida das contas.
 */
function MinhaConta() {
  const { usuario } = useSession();
  if (!usuario) return <Carregando texto="Carregando a sua conta…" />;
  // A chave recomeça os formulários quando a sessão muda (outro nome salvo).
  return <Formularios key={`${usuario.name}:${usuario.revisaoPadraoDias}`} usuario={usuario} />;
}

function Formularios({ usuario }: { usuario: Usuario }) {
  const queryClient = useQueryClient();
  const salvar = useServerFn(atualizarPerfil);

  const [nome, setNome] = useState(usuario.name);
  const [comPadrao, setComPadrao] = useState(usuario.revisaoPadraoDias !== null);
  const [dias, setDias] = useState<number>(usuario.revisaoPadraoDias ?? 90);

  const mutacao = useMutation({
    mutationFn: (dados: { name?: string; revisaoPadraoDias?: number | null }) =>
      salvar({ data: dados }),
    onSuccess: async () => {
      // A sessão traz o nome do rodapé e o padrão que o formulário de FAQ usa.
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Salvo");
    },
    onError: (erro: Error) =>
      toast.error(erro.message || "Não foi possível salvar. Confira a internet e tente de novo."),
  });

  const nomeCurto = nome.trim().length < 2;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Minha conta"
        frase="O seu nome, o que o seu grupo abre e as suas preferências."
      />

      <form
        className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (nomeCurto) return;
          // O botão aceita o toque e diz o que houve: apagado, não explicaria nada.
          if (nome.trim() === usuario.name) {
            toast.info("O nome já está assim. Mude o texto para salvar outro.");
            return;
          }
          mutacao.mutate({ name: nome.trim() });
        }}
      >
        <h2 className="text-base font-semibold">Nome</h2>
        <div className="space-y-2">
          <Label htmlFor="conta-nome">Como o seu nome aparece no painel</Label>
          <Input
            id="conta-nome"
            value={nome}
            maxLength={120}
            autoComplete="name"
            onChange={(e) => setNome(e.target.value)}
            aria-invalid={nomeCurto}
          />
          <p
            className={
              nomeCurto ? "text-sm font-semibold text-destructive" : "text-sm text-muted-foreground"
            }
          >
            {nomeCurto
              ? "Escreva o nome, com ao menos 2 letras."
              : "É o nome que aparece como autor das FAQs e no Histórico."}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          E-mail: {usuario.email}. Para mudar o e-mail, peça a quem cuida das contas.
        </p>
        <Button type="submit" disabled={mutacao.isPending}>
          {mutacao.isPending ? "Salvando…" : "Salvar o nome"}
        </Button>
      </form>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
          Acesso
          <Selo tom="marca">{usuario.grupo.nome}</Selo>
          {usuario.master && <Selo tom="atencao">Master</Selo>}
        </h2>
        <p className="text-sm text-muted-foreground">
          {usuario.master
            ? "Como master, você abre tudo, e cria e muda os grupos."
            : "O que o seu grupo abre. Para mudar, peça ao master do painel."}
        </p>
        <dl className="grid gap-1 text-sm">
          {GRUPOS.map((secao) => {
            const itens = DESTINOS.filter(
              (d) => d.grupo === secao.id && d.area && pode(usuario, d.area),
            );
            if (itens.length === 0) return null;
            return (
              <div key={secao.id} className="flex flex-wrap gap-x-1.5">
                <dt className="font-semibold">{secao.rotulo}:</dt>
                <dd className="text-muted-foreground">
                  {itens
                    .map((d) => {
                      // O master tem o nível mais alto de cada área: Histórico só tem ver.
                      const nivel =
                        usuario.master && d.area
                          ? INFO_AREA[d.area].niveis.editar
                            ? "editar"
                            : "ver"
                          : d.area
                            ? usuario.permissoes[d.area]
                            : undefined;
                      return `${d.rotulo}${d.area && nivel ? ` (${rotuloDoNivel(d.area, nivel)})` : ""}`;
                    })
                    .join(", ")}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Revisão das FAQs que você criar</h2>
        <div className="flex items-start justify-between gap-4">
          <Label htmlFor="conta-com-padrao" className="min-h-11 flex-1 cursor-pointer">
            <span className="block text-[15px] font-semibold">
              Toda FAQ que eu criar já vem com revisão
            </span>
            <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
              O formulário já abre com a data marcada, e você muda ou desliga em cada FAQ. Útil para
              quem escreve sobre campanhas e surtos.
            </span>
          </Label>
          <Switch
            id="conta-com-padrao"
            checked={comPadrao}
            onCheckedChange={setComPadrao}
            className="mt-1"
          />
        </div>

        {comPadrao && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Revisar depois de</legend>
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-[3px]">
              {PRAZOS.map((prazo) => (
                <label key={prazo.dias} className="relative">
                  <input
                    type="radio"
                    name="conta-prazo"
                    value={prazo.dias}
                    checked={dias === prazo.dias}
                    onChange={() => setDias(prazo.dias)}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-11 cursor-pointer items-center whitespace-nowrap rounded-md px-3.5 text-[15px] font-semibold text-muted-foreground transition-colors hover:text-foreground peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    {prazo.rotulo}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <p className="text-sm text-muted-foreground">
          {usuario.revisaoPadraoDias === null
            ? "Agora: sem padrão. A revisão é marcada FAQ por FAQ."
            : `Agora: revisão em ${textoDoPrazo(usuario.revisaoPadraoDias)}.`}
        </p>
        <Button
          type="button"
          disabled={mutacao.isPending}
          onClick={() => mutacao.mutate({ revisaoPadraoDias: comPadrao ? dias : null })}
        >
          {mutacao.isPending ? "Salvando…" : "Salvar a preferência"}
        </Button>
      </section>
    </div>
  );
}

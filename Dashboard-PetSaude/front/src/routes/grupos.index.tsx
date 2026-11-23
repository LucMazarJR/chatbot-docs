import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, Pencil, Plus } from "lucide-react";

import { GateShell } from "@/components/gate";
import { CabecalhoPagina } from "@/components/cabecalho-pagina";
import { Carregando } from "@/components/carregando";
import { EstadoFalha, EstadoVazio } from "@/components/estado";
import { Selo } from "@/components/selo";
import { Button } from "@/components/ui/button";
import { listarGrupos, type Grupo } from "@/lib/grupos.functions";
import { exigirMaster } from "@/lib/guardas";
import { DESTINOS, GRUPOS } from "@/lib/navegacao";
import { INFO_AREA } from "@/lib/permissoes";

export const Route = createFileRoute("/grupos/")({
  beforeLoad: () => exigirMaster(),
  head: () => ({ meta: [{ title: "Grupos | Central de FAQs" }] }),
  component: GruposPage,
});

function GruposPage() {
  return (
    <GateShell>
      <ListaDeGrupos />
    </GateShell>
  );
}

function ListaDeGrupos() {
  const grupos = useQuery({ queryKey: ["grupos"], queryFn: () => listarGrupos() });

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Grupos"
        frase="Cada grupo diz o que os membros veem e mudam, item por item do menu. Mudar um grupo vale para todos os membros na próxima tela que abrirem."
        acoes={
          <Button asChild>
            <Link to="/grupos/$id" params={{ id: "novo" }}>
              <Plus /> Novo grupo
            </Link>
          </Button>
        }
      />

      {grupos.isError ? (
        <EstadoFalha onTentarDeNovo={() => grupos.refetch()} tentando={grupos.isFetching}>
          Não foi possível carregar os grupos. Confira a internet e tente de novo.
        </EstadoFalha>
      ) : grupos.isLoading ? (
        <Carregando texto="Carregando os grupos…" />
      ) : (grupos.data ?? []).length === 0 ? (
        <EstadoVazio titulo="Nenhum grupo ainda">
          Crie um grupo para poder dar acesso ao painel a outras pessoas.
        </EstadoVazio>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {(grupos.data ?? []).map((g) => (
            <CartaoGrupo key={g.id} grupo={g} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CartaoGrupo({ grupo }: { grupo: Grupo }) {
  const pessoas =
    grupo.membros === 0
      ? "Ninguém ainda"
      : grupo.membros === 1
        ? "1 pessoa"
        : `${grupo.membros} pessoas`;
  const veDadoDeCidadao = DESTINOS.some(
    (d) => d.area && grupo.permissoes[d.area] && INFO_AREA[d.area].dadoDeCidadao,
  );

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
          {grupo.nome}
          {veDadoDeCidadao && <Selo tom="atencao">Vê o que cidadãos escreveram</Selo>}
        </p>
        {grupo.descricao && (
          <p className="mt-0.5 text-sm text-muted-foreground">{grupo.descricao}</p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {pessoas}
          {grupo.desativadas > 0 &&
            ` (e ${grupo.desativadas} ${grupo.desativadas === 1 ? "conta desativada" : "contas desativadas"})`}
        </p>
      </div>

      {/* O acesso na ordem do menu, para bater com o que os membros veem. */}
      <dl className="grid gap-1 text-sm">
        {GRUPOS.map((secao) => {
          const itens = DESTINOS.filter(
            (d) => d.grupo === secao.id && d.area && grupo.permissoes[d.area],
          );
          if (itens.length === 0) return null;
          return (
            <div key={secao.id} className="flex flex-wrap gap-x-1.5">
              <dt className="font-semibold">{secao.rotulo}:</dt>
              <dd className="text-muted-foreground">
                {itens
                  .map((d) => `${d.rotulo} (${d.area ? grupo.permissoes[d.area] : ""})`)
                  .join(", ")}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/grupos/$id" params={{ id: grupo.id }}>
            <Pencil /> Editar
          </Link>
        </Button>
        <Button asChild variant="outline">
          {/* Duplicar parte das permissões deste grupo: mais rápido que marcar
              tudo de novo para um grupo parecido. */}
          <Link to="/grupos/$id" params={{ id: "novo" }} search={{ base: grupo.id }}>
            <Copy /> Duplicar
          </Link>
        </Button>
      </div>
    </li>
  );
}

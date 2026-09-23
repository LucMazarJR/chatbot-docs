import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Moon, Search, Sun } from "lucide-react";

import type { UserRole } from "@/lib/auth.functions";
import { getFilaCuradoria } from "@/lib/curadoria.functions";
import { gruposDe } from "@/lib/navegacao";
import { aplicarTema, temaAtual, type Tema } from "@/lib/tema";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";

const ROTULO_PAPEL: Record<UserRole, string> = {
  admin: "Administrador",
  editor: "Editor",
  leitor: "Leitor",
};

/** Duas letras do nome, para o círculo do rodapé do menu. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase() || "?";
}

/** O destino está aberto? A home só por igualdade; as demais incluem as subpáginas. */
function ativo(caminho: string, para: string): boolean {
  if (para === "/") return caminho === "/" || caminho.startsWith("/faqs/");
  return caminho === para || caminho.startsWith(`${para}/`);
}

/**
 * A navegação do dashboard, agrupada por área.
 *
 * No desktop recolhe para só os ícones (com o nome ao passar o mouse) e lembra a
 * escolha; no celular vira gaveta. Os grupos e os itens vêm de `lib/navegacao.ts`.
 */
export function BarraLateral({
  usuario,
  onSair,
}: {
  usuario: { name: string; role: UserRole };
  onSair: () => void;
}) {
  const caminho = useRouterState({ select: (estado) => estado.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  const grupos = gruposDe(usuario.role);

  // O número ao lado de "Sem resposta" é o trabalho esperando. Só admin vê a
  // tela, e só para admin a consulta roda. Enquanto não chega, nada aparece:
  // um zero provisório diria que não há nada para fazer.
  const fila = useQuery({
    queryKey: ["curadoria-fila"],
    queryFn: () => getFilaCuradoria(),
    enabled: usuario.role === "admin",
    staleTime: 60_000,
  });
  const pendentes = fila.data?.pendentes ?? 0;

  // No celular a barra é uma gaveta por cima do conteúdo: escolhida a tela, ela
  // precisa sair da frente.
  const aoEscolher = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Central de FAQs">
              <Link to="/" onClick={aoEscolher}>
                <img
                  src="/logo-pet-saude.png"
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 shrink-0 rounded-full bg-white"
                />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-base font-semibold">Central de FAQs</span>
                  <span className="block truncate text-[13px] text-sidebar-muted">PET-Saúde</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {grupos.map((grupo) => (
          <SidebarGroup key={grupo.id}>
            <SidebarGroupLabel>{grupo.rotulo}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {grupo.destinos.map((destino) => (
                  <SidebarMenuItem key={destino.para}>
                    <SidebarMenuButton
                      asChild
                      isActive={ativo(caminho, destino.para as string)}
                      tooltip={destino.rotulo}
                    >
                      <Link to={destino.para} onClick={aoEscolher}>
                        <destino.Icone />
                        <span>{destino.rotulo}</span>
                      </Link>
                    </SidebarMenuButton>
                    {destino.para === "/curadoria" && pendentes > 0 && (
                      <SidebarMenuBadge
                        aria-label={`${pendentes} esperando análise`}
                        className="peer-data-[size=default]/menu-button:top-3 h-5 min-w-6 rounded-full bg-sidebar-contador px-2 text-[13px] font-bold text-sidebar-contador-foreground peer-hover/menu-button:text-sidebar-contador-foreground peer-data-[active=true]/menu-button:text-sidebar-contador-foreground"
                      >
                        {pendentes}
                      </SidebarMenuBadge>
                    )}
                    {destino.emTeste && (
                      <SidebarMenuBadge className="peer-data-[size=default]/menu-button:top-3 text-xs font-normal text-sidebar-muted peer-hover/menu-button:text-sidebar-muted peer-data-[active=true]/menu-button:text-sidebar-muted">
                        em teste
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex min-w-0 items-center gap-3 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold"
              >
                {iniciais(usuario.name)}
              </span>
              <span className="min-w-0 text-sm leading-tight">
                <span className="block truncate font-semibold">{usuario.name}</span>
                <span className="text-sidebar-muted">{ROTULO_PAPEL[usuario.role]}</span>
              </span>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sair" onClick={onSair}>
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

/**
 * "Ir para…": procurar a tela pelo nome.
 *
 * Com dezenas de telas, digitar "curadoria" é mais rápido que lembrar em que grupo
 * ela está. Ctrl+K (⌘K no Mac) abre de qualquer tela; no celular, o botão da
 * barra do topo. Lê o mesmo registro da barra lateral, então não há o que manter.
 */
export function IrPara({ papel }: { papel: UserRole }) {
  const [aberto, setAberto] = useState(false);
  const navigate = useNavigate();
  const grupos = gruposDe(papel);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key.toLowerCase() === "k" && (evento.metaKey || evento.ctrlKey)) {
        evento.preventDefault();
        setAberto((atual) => !atual);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="ml-auto flex h-11 min-w-11 items-center gap-2.5 rounded-md border border-border bg-background px-3.5 text-[15px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:w-72"
      >
        <Search className="size-[18px] shrink-0" />
        {/* No celular só a lupa aparece, mas o nome continua para o leitor de tela. */}
        <span className="sr-only sm:not-sr-only">Ir para…</span>
        <kbd
          aria-hidden="true"
          className="ml-auto hidden rounded-md border border-border px-1.5 font-mono text-xs font-semibold sm:inline"
        >
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={aberto} onOpenChange={setAberto}>
        {/* Invisível, mas presente: sem título o diálogo é anunciado sem nome. */}
        <DialogTitle className="sr-only">Ir para</DialogTitle>
        <DialogDescription className="sr-only">
          Digite o nome de uma tela do painel.
        </DialogDescription>
        <CommandInput placeholder="Ir para…" />
        <CommandList>
          <CommandEmpty>Nenhuma tela com esse nome.</CommandEmpty>
          {grupos.map((grupo) => (
            <CommandGroup key={grupo.id} heading={grupo.rotulo}>
              {grupo.destinos.map((destino) => (
                <CommandItem
                  key={destino.para}
                  // O valor é o que a busca compara: nome e sinônimos juntos.
                  value={[destino.rotulo, ...(destino.sinonimos ?? [])].join(" ")}
                  onSelect={() => {
                    setAberto(false);
                    void navigate({ to: destino.para });
                  }}
                >
                  <destino.Icone />
                  <span>{destino.rotulo}</span>
                  {destino.emTeste && (
                    <span className="ml-auto text-xs text-muted-foreground">em teste</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

/**
 * Claro ou escuro. O estado real vive na classe do <html>, que o script do
 * <head> já aplicou; aqui só se lê depois de montar, porque no servidor não há
 * como saber o tema de quem vai abrir.
 */
export function BotaoTema() {
  const [tema, setTema] = useState<Tema | null>(null);
  useEffect(() => setTema(temaAtual()), []);

  const proximo: Tema = tema === "escuro" ? "claro" : "escuro";
  const rotulo = proximo === "escuro" ? "Usar o tema escuro" : "Usar o tema claro";

  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onClick={() => {
        aplicarTema(proximo);
        setTema(proximo);
      }}
      className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {tema === "escuro" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

/**
 * "Chatbot / Conversas": onde a pessoa está, no topo de toda tela.
 *
 * Lê o mesmo registro do menu, então tela nova aparece aqui sem editar nada.
 */
export function Caminho({ papel }: { papel: UserRole }) {
  const caminho = useRouterState({ select: (estado) => estado.location.pathname });
  for (const grupo of gruposDe(papel)) {
    const destino = grupo.destinos.find((d) => ativo(caminho, d.para as string));
    if (destino) {
      const noDetalhe = caminho !== destino.para;
      return (
        <nav aria-label="Você está em" className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">
          {grupo.rotulo} /{" "}
          {noDetalhe ? (
            <Link to={destino.para} className="hover:text-foreground hover:underline">
              {destino.rotulo}
            </Link>
          ) : (
            <span aria-current="page" className="text-foreground">
              {destino.rotulo}
            </span>
          )}
        </nav>
      );
    }
  }
  return null;
}

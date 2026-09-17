import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Search, Stethoscope } from "lucide-react";

import type { UserRole } from "@/lib/auth.functions";
import { gruposDe } from "@/lib/navegacao";
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
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
                  <Stethoscope className="size-5" />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-semibold">Central de FAQs</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    PET-SAÚDE · base do chatbot
                  </span>
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
                    {destino.emTeste && <SidebarMenuBadge>teste</SidebarMenuBadge>}
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
            <div className="min-w-0 px-2 py-1 text-xs group-data-[collapsible=icon]:hidden">
              <span className="block truncate font-medium text-foreground">{usuario.name}</span>
              <span className="text-muted-foreground">{ROTULO_PAPEL[usuario.role]}</span>
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
        className="ml-auto flex h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:h-9"
      >
        <Search className="size-4" />
        {/* No celular só a lupa aparece, mas o nome continua para o leitor de tela. */}
        <span className="sr-only sm:not-sr-only">Ir para…</span>
        <kbd
          aria-hidden="true"
          className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:inline"
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
                    <span className="ml-auto rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
                      teste
                    </span>
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

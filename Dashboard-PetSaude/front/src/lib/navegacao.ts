import type { LinkProps } from "@tanstack/react-router";
import {
  BellRing,
  FolderOpen,
  History,
  ListChecks,
  MessagesSquare,
  Settings,
  Sparkles,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { UserRole } from "@/lib/auth.functions";

export type IdGrupo = "conteudo" | "chatbot" | "administracao";

export const GRUPOS: { id: IdGrupo; rotulo: string }[] = [
  { id: "conteudo", rotulo: "Conteúdo" },
  { id: "chatbot", rotulo: "Chatbot" },
  { id: "administracao", rotulo: "Administração" },
];

export type Destino = {
  /** Tipado pelas rotas que existem: um destino para rota inexistente não compila. */
  para: LinkProps["to"];
  rotulo: string;
  Icone: LucideIcon;
  grupo: IdGrupo;
  /** Quem vê. Ausente = todo mundo autenticado. */
  papeis?: UserRole[];
  /**
   * Funcionalidade em validação: aparece no menu real com um selo "teste".
   * Promover ou tirar do menu é mudar esta linha.
   */
  emTeste?: boolean;
  /** Outros nomes pelos quais alguém procuraria esta tela no "Ir para…". */
  sinonimos?: string[];
};

/**
 * Todas as telas do dashboard, num lugar só.
 *
 * LÓGICA DO LUCIANO: era uma lista solta dentro do gate.tsx, desenhada numa barra
 * horizontal — oito destinos lado a lado, já no limite da largura, e cada tela
 * nova exigia editar também uma união de strings com as rotas. Agora a barra
 * lateral, a gaveta do celular e o "Ir para…" leem daqui. Tela nova é uma linha.
 *
 * A visibilidade por papel é conveniência, não segurança: quem barra de verdade é
 * o `@Roles` do backend, e o `beforeLoad` de cada rota.
 */
export const DESTINOS: Destino[] = [
  {
    para: "/",
    rotulo: "FAQs",
    Icone: ListChecks,
    grupo: "conteudo",
    sinonimos: ["perguntas", "busca"],
  },
  {
    para: "/categorias",
    rotulo: "Categorias",
    Icone: FolderOpen,
    grupo: "conteudo",
    sinonimos: ["assuntos"],
  },
  {
    para: "/importar",
    rotulo: "Importar",
    Icone: Upload,
    grupo: "conteudo",
    papeis: ["admin", "editor"],
    sinonimos: ["planilha", "lote"],
  },
  // Conversas e a fila de sem resposta expõem o que cidadãos escreveram no chat.
  // Só admin, como Histórico e Usuários.
  {
    para: "/conversas",
    rotulo: "Conversas",
    Icone: MessagesSquare,
    grupo: "chatbot",
    papeis: ["admin"],
    sinonimos: ["transcrições", "avaliações"],
  },
  {
    para: "/curadoria",
    rotulo: "Sem resposta",
    Icone: Sparkles,
    grupo: "chatbot",
    papeis: ["admin"],
    sinonimos: ["curadoria", "sugestões", "lacunas"],
  },
  {
    para: "/notificacoes",
    rotulo: "Avisos",
    Icone: BellRing,
    grupo: "chatbot",
    papeis: ["admin"],
    emTeste: true,
    sinonimos: ["notificações", "push", "lembretes"],
  },
  {
    para: "/usuarios",
    rotulo: "Usuários",
    Icone: Users,
    grupo: "administracao",
    papeis: ["admin"],
    sinonimos: ["contas", "acesso"],
  },
  {
    para: "/auditoria",
    rotulo: "Histórico",
    Icone: History,
    grupo: "administracao",
    papeis: ["admin"],
    sinonimos: ["auditoria", "registro"],
  },
  {
    para: "/configuracoes",
    rotulo: "Configurações",
    Icone: Settings,
    grupo: "administracao",
    papeis: ["admin"],
    sinonimos: ["embeddings", "vetores", "scripts"],
  },
];

export function destinosDe(papel: UserRole | undefined): Destino[] {
  if (!papel) return [];
  return DESTINOS.filter((destino) => !destino.papeis || destino.papeis.includes(papel));
}

/** Os grupos com ao menos um destino visível para o papel — grupo vazio não aparece. */
export function gruposDe(papel: UserRole | undefined) {
  const visiveis = destinosDe(papel);
  return GRUPOS.map((grupo) => ({
    ...grupo,
    destinos: visiveis.filter((destino) => destino.grupo === grupo.id),
  })).filter((grupo) => grupo.destinos.length > 0);
}

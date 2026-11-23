import type { LinkProps } from "@tanstack/react-router";
import {
  BellRing,
  Building2,
  FileBarChart,
  FolderOpen,
  History,
  ListChecks,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

import { pode, type Area, type ComAcesso } from "@/lib/permissoes";

export type IdGrupo = "conteudo" | "chatbot" | "administracao";

export const GRUPOS: { id: IdGrupo; rotulo: string }[] = [
  { id: "conteudo", rotulo: "Conteúdo" },
  { id: "chatbot", rotulo: "Chatbot" },
  { id: "administracao", rotulo: "Administração" },
];

/**
 * Quem vê o item: quem tem a área no grupo, ou só o master. A tela de grupos não
 * é de área nenhuma, porque muda o acesso de todo mundo.
 */
type Acesso =
  | {
      /**
       * A área do grupo que abre esta tela. É também a linha da tela de grupos:
       * o que o master marca lá é, item por item, este menu.
       */
      area: Area;
      soMaster?: never;
    }
  | { soMaster: true; area?: never };

export type Destino = Acesso & {
  /** Tipado pelas rotas que existem: um destino para rota inexistente não compila. */
  para: LinkProps["to"];
  rotulo: string;
  Icone: LucideIcon;
  grupo: IdGrupo;
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
 * horizontal: oito destinos lado a lado, já no limite da largura, e cada tela
 * nova exigia editar também uma união de strings com as rotas. Agora a barra
 * lateral, a gaveta do celular e o "Ir para…" leem daqui. Tela nova é uma linha.
 *
 * A visibilidade pelo grupo é conveniência, não segurança: quem barra de verdade
 * é o `@Permite` do backend, e o `beforeLoad` de cada rota.
 */
export const DESTINOS: Destino[] = [
  {
    para: "/",
    area: "faqs",
    rotulo: "FAQs",
    Icone: ListChecks,
    grupo: "conteudo",
    sinonimos: ["perguntas", "busca"],
  },
  {
    para: "/categorias",
    area: "categorias",
    rotulo: "Categorias",
    Icone: FolderOpen,
    grupo: "conteudo",
    sinonimos: ["assuntos"],
  },
  {
    para: "/importar",
    area: "importar",
    rotulo: "Importar",
    Icone: Upload,
    grupo: "conteudo",
    sinonimos: ["planilha", "lote"],
  },
  {
    para: "/conversas",
    area: "conversas",
    rotulo: "Conversas",
    Icone: MessagesSquare,
    grupo: "chatbot",
    sinonimos: ["transcrições", "avaliações"],
  },
  {
    para: "/unidades",
    area: "unidades",
    rotulo: "Unidades de saúde",
    Icone: Building2,
    grupo: "chatbot",
    emTeste: true,
    sinonimos: ["ubs", "postos", "de onde vêm as conversas"],
  },
  {
    para: "/curadoria",
    area: "curadoria",
    rotulo: "Sem resposta",
    Icone: Sparkles,
    grupo: "chatbot",
    sinonimos: ["curadoria", "sugestões", "lacunas"],
  },
  {
    para: "/relatorios",
    area: "relatorios",
    rotulo: "Relatório do dia",
    Icone: FileBarChart,
    grupo: "chatbot",
    emTeste: true,
    sinonimos: ["relatório", "resumo", "pdf", "análise"],
  },
  {
    para: "/notificacoes",
    area: "avisos",
    rotulo: "Avisos",
    Icone: BellRing,
    grupo: "chatbot",
    emTeste: true,
    sinonimos: ["notificações", "push", "lembretes"],
  },
  {
    para: "/usuarios",
    area: "usuarios",
    rotulo: "Usuários",
    Icone: Users,
    grupo: "administracao",
    sinonimos: ["contas", "acesso"],
  },
  {
    para: "/grupos",
    soMaster: true,
    rotulo: "Grupos",
    Icone: ShieldCheck,
    grupo: "administracao",
    sinonimos: ["permissões", "acesso", "papéis", "master"],
  },
  {
    para: "/auditoria",
    area: "historico",
    rotulo: "Histórico",
    Icone: History,
    grupo: "administracao",
    sinonimos: ["auditoria", "registro"],
  },
  {
    para: "/configuracoes",
    area: "configuracoes",
    rotulo: "Configurações",
    Icone: Settings,
    grupo: "administracao",
    sinonimos: ["embeddings", "vetores", "scripts"],
  },
];

/** O nome da área como aparece no menu: "curadoria" é "Sem resposta" na tela. */
export function rotuloDaArea(area: Area): string {
  return DESTINOS.find((destino) => destino.area === area)?.rotulo ?? area;
}

export function destinosDe(usuario: ComAcesso): Destino[] {
  return DESTINOS.filter((destino) =>
    destino.soMaster ? Boolean(usuario?.master) : pode(usuario, destino.area),
  );
}

/** Os grupos do menu com ao menos um destino visível: grupo vazio não aparece. */
export function gruposDe(usuario: ComAcesso) {
  const visiveis = destinosDe(usuario);
  return GRUPOS.map((grupo) => ({
    ...grupo,
    destinos: visiveis.filter((destino) => destino.grupo === grupo.id),
  })).filter((grupo) => grupo.destinos.length > 0);
}

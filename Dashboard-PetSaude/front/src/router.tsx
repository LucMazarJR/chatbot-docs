import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // O padrão do React Query é staleTime: 0 — toda vez que um
        // componente remonta (voltar de /categorias para "/", trocar de aba
        // e voltar), a query é refeita, mesmo que os dados tenham chegado há
        // 2 segundos. Para uma lista de FAQs que só muda quando alguém edita
        // pelo próprio dashboard, isso é rede gasta à toa — e cada chamada a
        // mais é uma chance de acordar um backend hibernado (Render free) ou
        // um Postgres serverless em scale-to-zero (Neon).
        //
        // 30s é curto o bastante para nunca parecer desatualizado numa sessão
        // de uso normal, e as mutações (criar/editar/excluir FAQ, mudar
        // papel de usuário) já chamam invalidateQueries explicitamente — elas
        // não esperam o staleTime vencer.
        staleTime: 30_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

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

        // LOGICA DO LUCIANO: o padrao do React Query no cliente e 3
        // retentativas com espera exponencial (1s + 2s + 4s). Para 401 e 403
        // isso e puro desperdicio: a resposta nao vai mudar porque insistimos.
        //
        // E era pior que desperdicio. No logout, o cookie e apagado e so entao
        // o cache era invalidado; toda query ativa passava a devolver 401 e
        // gastava as tres retentativas, segurando o redirecionamento para o
        // login por 7 a 30 segundos. A tela ficava num meio-termo: o menu
        // sumia, o conteudo continuava, e parecia que sair nao tinha
        // funcionado.
        //
        // O `status` do ApiError pode nao sobreviver a serializacao das server
        // functions, entao a mensagem tambem e conferida -- e o apiFetch monta
        // "Erro 401" quando o backend responde sem corpo JSON.
        retry: (tentativas, erro) => {
          const status = (erro as { status?: number })?.status;
          const texto = erro instanceof Error ? erro.message : String(erro);
          const semSessao =
            status === 401 || status === 403 || texto.includes("401") || texto.includes("403");
          return semSessao ? false : tentativas < 2;
        },
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

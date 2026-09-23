import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ehVersaoAntiga, recarregarParaVersaoNova } from "../lib/versao-nova";
import { SCRIPT_DO_TEMA } from "../lib/tema";
import { Button, buttonVariants } from "../components/ui/button";

/**
 * Moldura das telas de fora do painel (404 e erro): logo, título, frase e ações.
 * Fica fora do menu lateral porque a tela de erro pode aparecer antes de a
 * sessão carregar, e o menu depende dela.
 */
function TelaAvulsa({
  titulo,
  children,
  acoes,
}: {
  titulo: string;
  children: ReactNode;
  acoes: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm sm:p-8">
        <img
          src="/logo-pet-saude.png"
          alt=""
          width={48}
          height={48}
          className="mx-auto size-12 rounded-full bg-white ring-1 ring-border"
        />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">{titulo}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{children}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">{acoes}</div>
      </div>
    </main>
  );
}

function NotFoundComponent() {
  return (
    <TelaAvulsa
      titulo="Página não encontrada"
      acoes={
        <Link to="/" className={buttonVariants()}>
          Ir para as FAQs
        </Link>
      }
    >
      O endereço pode ter sido digitado errado, ou a página mudou de lugar. Volte para as
      FAQs e siga pelo menu.
    </TelaAvulsa>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const versaoAntiga = ehVersaoAntiga(error);
  useEffect(() => {
    if (versaoAntiga && recarregarParaVersaoNova()) return;
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error, versaoAntiga]);

  return (
    <TelaAvulsa
      titulo="Não foi possível carregar a página"
      acoes={
        <>
          <Button
            onClick={() => {
              // Arquivo de tela que sumiu só volta com a página inteira.
              if (versaoAntiga) {
                window.location.reload();
                return;
              }
              router.invalidate();
              reset();
            }}
          >
            Tentar de novo
          </Button>
          <a href="/" className={buttonVariants({ variant: "outline" })}>
            Ir para as FAQs
          </a>
        </>
      }
    >
      Pode ser a internet ou uma falha no servidor. Toque em Tentar de novo. Se continuar,
      espere alguns minutos e avise um administrador do painel.
    </TelaAvulsa>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Central de FAQs | PET-SAÚDE" },
      {
        name: "description",
        content: "Painel de gestão das FAQs do chatbot de saúde do PET-SAÚDE.",
      },
      { property: "og:title", content: "Central de FAQs | PET-SAÚDE" },
      {
        property: "og:description",
        content: "Painel de gestão das FAQs do chatbot de saúde do PET-SAÚDE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
      },

      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // O script do tema muda a classe do <html> antes do React hidratar.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DO_TEMA }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // A falha de arquivo de tela nem sempre chega à tela de erro: quando o Vite
  // pré-carrega a próxima tela, ela vem por este evento.
  useEffect(() => {
    const aoFalhar = (evento: Event) => {
      if (recarregarParaVersaoNova()) evento.preventDefault();
    };
    window.addEventListener("vite:preloadError", aoFalhar);
    return () => window.removeEventListener("vite:preloadError", aoFalhar);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}

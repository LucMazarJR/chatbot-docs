# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File                     | URL                                                     |
| ------------------------ | ------------------------------------------------------- |
| `index.tsx`              | `/`                                                     |
| `about.tsx`              | `/about`                                                |
| `users/index.tsx`        | `/users`                                                |
| `users/$id.tsx`          | `/users/:id` (dynamic — bare `$`, no curly braces)      |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment)                  |
| `files/$.tsx`            | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx`            | layout route (renders children via `<Outlet />`)        |
| `__root.tsx`             | app shell — wraps every page; preserve `<Outlet />`     |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Tela nova no dashboard

Três passos, e nenhum deles mexe no menu à mão:

1. **A rota**, com a guarda no `beforeLoad` — `exigirSessao()` ou `exigirAdmin()`,
   de `lib/guardas.ts`. É ela que barra quem não pode ver a tela, junto com o
   `@Roles` do backend.
2. **A moldura**: o conteúdo da página vai dentro de `<GateShell>`
   (`components/gate.tsx`). Não há route layout; é o `GateShell` que desenha a
   barra lateral, o topo e o bloqueio de troca de senha.
3. **Uma linha em `lib/navegacao.ts`**, com o grupo, o ícone, os papéis que veem
   o item e, se for o caso, `emTeste: true` para o selo "teste". A barra lateral,
   a gaveta do celular e o "Ir para…" (Ctrl+K) leem desse registro.

O `para` de cada item é tipado pelas rotas geradas: um item apontando para uma
rota que não existe não compila.

import { createStart } from "@tanstack/react-start";

// LÓGICA DO LUCIANO: as duas listas ficam vazias de propósito.
//
// Aqui havia um `attachSupabaseAuth` importado: resíduo do scaffold do
// Lovable, que anexava um bearer do Supabase a cada chamada de server function.
// O projeto nunca usou Supabase: a autenticação é JWT próprio, selado num
// cookie httpOnly e anexado pelo `apiFetch` em `lib/api.server.ts`.
//
// O import era pior que inofensivo. Ele nunca chegou a ser registrado nas
// listas, então o middleware jamais rodou, mas o módulo do cliente Supabase
// entrava no bundle e, ao primeiro acesso, lançaria por falta de
// SUPABASE_URL: um erro sobre um serviço que este projeto não usa, esperando
// alguém tropeçar nele.
export const startInstance = createStart(() => ({
  functionMiddleware: [],
  requestMiddleware: [],
}));

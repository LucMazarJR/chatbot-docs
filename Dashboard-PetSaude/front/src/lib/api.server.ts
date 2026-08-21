import { getAccessToken } from "./auth.server";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3333";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Chama a API já com o Bearer token da sessão.
 *
 * Toda chamada do dashboard passa por aqui: assim ninguém esquece de anexar o
 * token, e a mensagem de erro que chega na tela é a que o backend escreveu, em
 * vez de um "Erro ao salvar" genérico.
 */
export async function apiFetch<T>(
  caminho: string,
  opcoes: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...resto } = opcoes;
  const cabecalhos: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = await getAccessToken();
    if (token) cabecalhos.Authorization = `Bearer ${token}`;
  }

  const resposta = await fetch(`${API_BASE}${caminho}`, { ...resto, headers: cabecalhos });

  if (!resposta.ok) {
    // O Nest devolve `message` como string ou como array (uma entrada por campo
    // reprovado na validação). Juntar as duas formas aqui evita "[object Object]"
    // aparecendo no toast.
    let mensagem = `Erro ${resposta.status}`;
    try {
      const corpo = await resposta.json();
      if (Array.isArray(corpo?.message)) mensagem = corpo.message.join(". ");
      else if (typeof corpo?.message === "string") mensagem = corpo.message;
    } catch {
      // resposta sem corpo JSON — mantém a mensagem padrão
    }
    throw new ApiError(mensagem, resposta.status);
  }

  if (resposta.status === 204) return undefined as T;
  return resposta.json();
}

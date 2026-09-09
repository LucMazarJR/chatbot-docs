import { limites } from './db';

/**
 * Freio de mão contra queimar a cota do Gemini.
 *
 * O acesso é aberto de propósito (o link circula entre participantes), mas a
 * cota gratuita é de 500 conversas/dia. Sem nenhum limite, uma aba deixada
 * segurando F5 — ou alguém curioso com o link — derruba o teste do dia inteiro.
 *
 * A contagem vive no MongoDB, e não em memória, por causa do Vercel: lá cada
 * requisição pode cair numa instância diferente, e instâncias frias começam com
 * a memória zerada. Um limite em memória contaria "1 de 40" indefinidamente e
 * não seguraria nada. No Docker, onde há um processo só, o resultado é o mesmo
 * — mas o custo de uma escrita por mensagem é irrelevante e vale a garantia.
 *
 * Isto é proteção contra acidente, não contra ataque: quem quiser burlar troca
 * de IP.
 */

const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_JANELA = 40;

type Registro = {
  _id: string;
  marcas: Date[];
  expiraEm: Date;
};

export async function dentroDoLimite(chave: string): Promise<boolean> {
  const agora = new Date();
  const corte = new Date(agora.getTime() - JANELA_MS);

  try {
    const col = await limites();

    const registro = await col.findOneAndUpdate(
      { _id: chave },
      {
        // `$slice` negativo mantém só as últimas marcas: sem ele o documento
        // cresceria sem teto enquanto o IP continuasse ativo.
        $push: { marcas: { $each: [agora], $slice: -(MAX_POR_JANELA + 1) } },
        $set: { expiraEm: new Date(agora.getTime() + JANELA_MS) },
      },
      { upsert: true, returnDocument: 'after' },
    );

    const recentes = (registro?.marcas ?? []).filter((marca) => new Date(marca) > corte);
    return recentes.length <= MAX_POR_JANELA;
  } catch {
    // Falha ao contar não pode impedir alguém de conversar: o limite existe
    // para proteger a cota, não para ser um portão. Deixa passar e segue.
    return true;
  }
}

export type { Registro as RegistroDeLimite };

/**
 * O proxy pode ser o cloudflared ou o próprio Vercel; sem ler o cabeçalho, o IP
 * de todos seria o da rede interna.
 */
export function identificar(requisicao: Request): string {
  const encaminhado = requisicao.headers.get('x-forwarded-for');
  return encaminhado?.split(',')[0]?.trim() || 'desconhecido';
}

import webpush from 'web-push';
import { MongoServerError } from 'mongodb';

import { configuracoes } from '@/lib/db';

export type ChavesVapid = { publica: string; privada: string; assunto: string };

/**
 * Contato que vai no cabeçalho VAPID. Os serviços de push usam para avisar de
 * abuso ou problema; não é mostrado a ninguém.
 */
const ASSUNTO_PADRAO = 'mailto:pet-saude@exemplo.org';

let emCache: Promise<ChavesVapid> | null = null;

/**
 * As chaves VAPID, geradas uma vez e guardadas no banco.
 *
 * LÓGICA DO LUCIANO: no banco, e não em variável de ambiente, por dois motivos.
 *
 * 1. Ninguém precisa gerar nem configurar nada para o push funcionar.
 * 2. O Docker e a Vercel usam o mesmo banco, então usam as MESMAS chaves. Uma
 *    inscrição fica amarrada às chaves com que foi feita: com chaves por
 *    ambiente, quem ativou os avisos pelo endereço da Vercel pararia de recebê-
 *    los quando o despachante do Docker enviasse com as dele: 403 em silêncio.
 *
 * Trocar as chaves invalida todas as inscrições existentes. Por isso elas só
 * nascem uma vez, e `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` só existem para quem
 * precisar trazer chaves de fora.
 */
export function chavesVapid(): Promise<ChavesVapid> {
  emCache ??= carregar().catch((erro) => {
    // Não guarda a falha: uma oscilação do banco não pode desligar o push até o
    // próximo reinício.
    emCache = null;
    throw erro;
  });
  return emCache;
}

async function carregar(): Promise<ChavesVapid> {
  const assunto = process.env.VAPID_SUBJECT || ASSUNTO_PADRAO;

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publica: process.env.VAPID_PUBLIC_KEY,
      privada: process.env.VAPID_PRIVATE_KEY,
      assunto,
    };
  }

  const col = await configuracoes();
  const existente = await col.findOne({ _id: 'vapid' });
  if (existente?.publica && existente.privada) {
    return { publica: existente.publica, privada: existente.privada, assunto };
  }

  const novas = webpush.generateVAPIDKeys();
  try {
    await col.insertOne({
      _id: 'vapid',
      publica: novas.publicKey,
      privada: novas.privateKey,
      criadaEm: new Date(),
    });
    return { publica: novas.publicKey, privada: novas.privateKey, assunto };
  } catch (erro) {
    // Duas instâncias geraram ao mesmo tempo: vale a que gravou primeiro, e a
    // outra descarta as suas. Sem isto, cada instância assinaria com um par
    // diferente e metade dos envios voltaria 403.
    if (erro instanceof MongoServerError && erro.code === 11000) {
      const vencedora = await col.findOne({ _id: 'vapid' });
      if (vencedora) return { publica: vencedora.publica, privada: vencedora.privada, assunto };
    }
    throw erro;
  }
}

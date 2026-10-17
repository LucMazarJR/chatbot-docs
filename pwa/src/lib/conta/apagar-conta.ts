import { apagarConversa } from '@/lib/apagar-conversa';
import { banco, contasSessoes, sessoes, usuarios } from '@/lib/db';

/**
 * Apaga a conta e tudo que pertence a ela.
 *
 * LÓGICA DO LUCIANO: as conversas vão pelo `apagarConversa`, e não por um
 * `deleteMany` direto. Ele é quem sabe que as perguntas sem resposta foram
 * copiadas para a curadoria, em outro banco: apagar só as mensagens deixaria o
 * texto da pessoa guardado lá, com a conta dela já inexistente.
 *
 * A conta sai por último. Se algo falhar no meio, a pessoa continua logada e
 * pode pedir de novo; na ordem inversa ela perderia o acesso com metade dos
 * dados ainda no banco, e sem conta não haveria mais como pedir.
 */
export async function apagarConta(usuarioId: string): Promise<{ conversas: number }> {
  const conversas = await (await sessoes())
    .find({ usuarioId }, { projection: { _id: 1 } })
    .map((sessao) => sessao._id)
    .toArray();

  for (const sessaoId of conversas) {
    await apagarConversa(sessaoId);
  }

  const db = await banco();
  await db.collection('notificacoes').deleteMany({ usuarioId });
  await db.collection('inscricoes_push').deleteMany({ usuarioId });
  // O registro dos gatilhos guarda de quem era cada aviso, para não repetir.
  await db.collection('gatilhos_disparos').deleteMany({ usuarioId });
  await (await contasSessoes()).deleteMany({ usuarioId });
  await (await usuarios()).deleteOne({ _id: usuarioId });

  return { conversas: conversas.length };
}

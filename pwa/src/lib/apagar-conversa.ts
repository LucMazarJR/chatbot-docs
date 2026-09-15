import { bancoDeFaqs, mensagens, sessoes } from '@/lib/db';

/** O que fica no lugar do texto apagado nas cópias da curadoria. */
export const MARCA_APAGADA = '[apagada a pedido da pessoa]';

export type ResultadoExclusao = {
  mensagens: number;
  sessao: boolean;
  /** Sugestões de FAQ que citavam uma pergunta desta conversa. */
  sugestoes: number;
  /** Rodadas de curadoria que tinham uma pergunta desta conversa. */
  rodadas: number;
};

/**
 * Apaga uma conversa, e as cópias dela.
 *
 * LÓGICA DO LUCIANO: apagar só `sessoes` e `mensagens` daria à pessoa a
 * impressão de ter exercido o direito de exclusão enquanto o texto dela
 * continuava guardado em outro banco. As perguntas que o assistente não soube
 * responder são COPIADAS para a curadoria — nas sugestões de FAQ e no histórico
 * de cada rodada, justamente para sobreviver ao fim do protótipo. Então a
 * exclusão precisa ir até lá.
 *
 * AS CÓPIAS VÃO PRIMEIRO. Se a limpeza falhar no meio, a conversa original
 * continua existindo e o pedido pode ser repetido do próprio chat. Na ordem
 * inversa, uma falha depois de apagar a sessão deixaria cópias que ninguém
 * mais conseguiria achar por aqui: sem sessão, a rota de exclusão responde 404.
 *
 * O que NÃO é alcançado, e por quê:
 * - A memória do agente no Redis expira sozinha em 1 hora (sessionTTL do fluxo).
 * - Os registros de execução do n8n se apagam pelo prazo de poda do n8n.
 * - Na rodada, a resposta crua do modelo é trocada inteira pela marca, e não só
 *   o trecho desta pessoa: o texto do modelo pode repetir a pergunta com outras
 *   palavras, e não há como separar com segurança. Custa a auditoria daquela
 *   rodada, que é o preço certo diante de um pedido de exclusão.
 * - O texto da sugestão em si é uma pergunta reescrita pelo modelo para virar
 *   FAQ, não a frase da pessoa, e fica.
 */
export async function apagarConversa(sessaoId: string): Promise<ResultadoExclusao> {
  const faqs = await bancoDeFaqs();

  const sugestoes = await faqs.collection('sugestoes_faq').updateMany(
    { 'origens.sessaoId': sessaoId },
    { $set: { 'origens.$[origem].pergunta': MARCA_APAGADA } },
    { arrayFilters: [{ 'origem.sessaoId': sessaoId }] },
  );

  const rodadas = await faqs.collection('curadoria_rodadas').updateMany(
    { 'lacunas.sessaoId': sessaoId },
    { $set: { 'lacunas.$[lacuna].pergunta': MARCA_APAGADA, respostaBruta: MARCA_APAGADA } },
    { arrayFilters: [{ 'lacuna.sessaoId': sessaoId }] },
  );

  const apagadas = await (await mensagens()).deleteMany({ sessaoId });
  const sessao = await (await sessoes()).deleteOne({ _id: sessaoId });

  return {
    mensagens: apagadas.deletedCount,
    sessao: sessao.deletedCount === 1,
    sugestoes: sugestoes.modifiedCount,
    rodadas: rodadas.modifiedCount,
  };
}

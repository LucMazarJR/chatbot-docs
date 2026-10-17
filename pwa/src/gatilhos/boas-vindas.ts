import type { InscricaoPush } from '@/lib/push/tipos';

import { definirGatilho } from './tipos';

const DIA = 24 * 60 * 60 * 1000;

/**
 * Um aviso para quem acabou de ativar os avisos pela primeira vez.
 *
 * Confirma, no próprio aparelho e sem a pessoa precisar testar, que os avisos
 * chegam. Serve também de exemplo real e de teste do caminho inteiro: ligar
 * o gatilho e ativar os avisos numa conta nova mostra o aviso na tela, e a
 * linha dele aparece em Avisos no painel.
 */
export default definirGatilho({
  id: 'boas-vindas',
  descricao: 'Avisa quem ativou os avisos pela primeira vez que eles funcionam no aparelho.',
  aCadaMinutos: 5,
  tipo: 'aviso',
  async verificar({ agora, db, ultimaExecucao }) {
    // Olha só as inscrições novas desde a última volta. Na primeira, o último
    // dia: ligar o gatilho não pode mandar boas-vindas a quem ativou há meses.
    const desde = new Date(Math.max(ultimaExecucao?.getTime() ?? 0, agora.getTime() - DIA));
    const inscricoes = db.collection<InscricaoPush>('inscricoes_push');

    const novas = await inscricoes.distinct('usuarioId', { criadaEm: { $gte: desde } });
    if (novas.length === 0) return [];

    // Primeira vez: a conta não tinha nenhum outro aparelho antes. Quem só
    // trocou de celular já conhece os avisos.
    const antigas = new Set(
      await inscricoes.distinct('usuarioId', { usuarioId: { $in: novas }, criadaEm: { $lt: desde } }),
    );

    return novas
      .filter((usuarioId) => !antigas.has(usuarioId))
      .map((usuarioId) => ({
        usuarioId,
        chave: `conta-${usuarioId}`,
        detalhe:
          'Os avisos estão ligados neste aparelho. Os lembretes de exames e consultas que a equipe de saúde mandar vão aparecer aqui.',
        validaAte: new Date(agora.getTime() + DIA),
      }));
  },
});

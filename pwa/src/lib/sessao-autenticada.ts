import { randomBytes } from 'node:crypto';

import { mensagens, sessoes } from '@/lib/db';
import type { Sessao } from '@/lib/tipos';

/** Cabeçalho onde o PWA manda a chave da própria sessão. */
export const CABECALHO_CHAVE = 'x-sessao-chave';

/**
 * Gera a chave de uma sessão nova.
 *
 * 32 bytes em base64url. Não é o id: o id aparece no corpo de respostas, nos
 * registros do n8n e no painel de conversas do dashboard, enquanto a chave só
 * existe em dois lugares — o documento da sessão e o `localStorage` de quem
 * está conversando.
 */
export function gerarChaveDeSessao(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * Confere que quem pede é dono da sessão.
 *
 * LÓGICA DO LUCIANO: até aqui bastava ter o id — um UUID — para ler a
 * transcrição inteira, mandar mensagem em nome da pessoa ou encerrar a conversa.
 * O id não é secreto: ele trafega no corpo das respostas, vai para o n8n, e
 * aparece na tela de conversas do dashboard. E o que essa transcrição contém é
 * relato de sintoma e pedido de atendimento, escrito por alguém identificável
 * pelo que conta.
 *
 * A chave conserta isso sem inventar login: ela é devolvida UMA vez, na criação
 * da sessão, e daí em diante só existe no aparelho de quem está conversando.
 *
 * SESSÕES ANTIGAS CONTINUAM ABRINDO. As que foram criadas antes deste campo não
 * têm chave nenhuma guardada, e exigi-la faria o protótipo esquecer conversas
 * que estão vivas no aparelho das pessoas — trocando um risco pequeno e
 * conhecido por uma quebra certa. Toda sessão nova nasce protegida, e as antigas
 * são as da primeira rodada de testes, já encerrada.
 */
export async function autenticarSessao(
    requisicao: Request,
    id: string,
): Promise<{ sessao: Sessao } | { erro: Response }> {
    const sessao = (await (await sessoes()).findOne({ _id: id })) as Sessao | null;

    if (!sessao) {
        return { erro: Response.json({ erro: 'sessão não encontrada' }, { status: 404 }) };
    }

    if (!sessao.chave) return { sessao };

    const apresentada = requisicao.headers.get(CABECALHO_CHAVE);
    if (apresentada !== sessao.chave) {
        // 404, e não 403: responder "existe, mas você não pode" confirmaria a
        // existência daquela conversa para quem só tinha o id.
        return { erro: Response.json({ erro: 'sessão não encontrada' }, { status: 404 }) };
    }

    return { sessao };
}

/**
 * O mesmo, para as rotas que recebem o id de uma MENSAGEM.
 *
 * A consulta de resposta e o voto de 👍/👎 não trazem o id da sessão, então a
 * sessão é alcançada pela mensagem. Sem isto, a rota de consulta continuaria
 * entregando o texto da resposta para quem tivesse o id da mensagem — que é o
 * mesmo conteúdo da transcrição, servido por outra porta.
 */
export async function autenticarPelaMensagem(
    requisicao: Request,
    mensagemId: string,
): Promise<{ sessaoId: string } | { erro: Response }> {
    const mensagem = await (await mensagens()).findOne(
        { _id: mensagemId },
        { projection: { sessaoId: 1 } },
    );

    if (!mensagem) {
        return { erro: Response.json({ erro: 'mensagem não encontrada' }, { status: 404 }) };
    }

    const resultado = await autenticarSessao(requisicao, mensagem.sessaoId);
    if ('erro' in resultado) {
        return { erro: Response.json({ erro: 'mensagem não encontrada' }, { status: 404 }) };
    }

    return { sessaoId: mensagem.sessaoId };
}

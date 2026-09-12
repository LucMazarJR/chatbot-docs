import { sessoes } from '@/lib/db';
import { autenticarSessao } from '@/lib/sessao-autenticada';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

/**
 * Registra o aceite dos termos.
 *
 * O aviso de privacidade era passivo: um recado no meio da conversa, que dava
 * para ignorar e seguir perguntando. Como o protótipo grava relato de saúde, o
 * consentimento precisa ser um ato — a pessoa clica em "Aceitar", e fica
 * registrado QUANDO. Sem aceite, o campo de mensagem não envia.
 *
 * Guardar a data é o que transforma o aviso em evidência: numa auditoria de
 * LGPD, "avisamos na tela" vale menos que "esta conversa começou às 14h32 com
 * aceite às 14h31".
 */
export async function POST(requisicao: Request, { params }: Contexto) {
    const { id } = await params;

    // O consentimento é a evidência de LGPD desta conversa. Aceitar em nome de
    // outra pessoa é o tipo de registro que não pode ser possível.
    const autenticada = await autenticarSessao(requisicao, id);
    if ('erro' in autenticada) return autenticada.erro;

    const corpo = (await requisicao.json().catch(() => ({}))) as { aceito?: boolean };

    const { matchedCount } = await (await sessoes()).updateOne(
        { _id: id },
        {
            $set: {
                consentimentoEm: corpo.aceito === true ? new Date() : null,
                consentimentoRecusadoEm: corpo.aceito === false ? new Date() : null,
            },
        },
    );

    if (!matchedCount) return Response.json({ erro: 'sessão não encontrada' }, { status: 404 });
    return Response.json({ ok: true });
}

/**
 * Espera a resposta ficar pronta, perguntando de tempos em tempos.
 *
 * Roda no navegador. Substituiu a espera dentro de uma única requisição: aquela
 * batia no teto de 60s da Vercel e perdia respostas que o n8n tinha gerado.
 * Aqui cada consulta dura milissegundos, e a espera total pode ser de minutos
 * sem nenhuma conexão pendurada.
 */

const INTERVALO_MS = 2_000;

/**
 * Um pouco acima do limite do servidor (4 min), que é quem de fato decide.
 * A folga evita a tela desistir de uma resposta que o servidor ainda daria.
 */
const MS_ATE_DESISTIR = 4.5 * 60 * 1000;

export type RespostaPronta = {
  resposta: string;
  erro: boolean;
  causa: 'demora' | 'fora-do-ar' | 'indisponivel' | null;
};

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function aguardarResposta(mensagemId: string): Promise<RespostaPronta> {
  const comecou = Date.now();

  while (Date.now() - comecou < MS_ATE_DESISTIR) {
    await espera(INTERVALO_MS);

    try {
      const res = await fetch(`/api/mensagens/${mensagemId}`, { cache: 'no-store' });
      if (!res.ok) continue;

      const dados = (await res.json()) as {
        pendente: boolean;
        erro?: boolean;
        resposta?: string;
        causa?: RespostaPronta['causa'];
      };

      if (dados.pendente) continue;

      return {
        resposta: dados.resposta ?? '',
        erro: Boolean(dados.erro),
        causa: dados.causa ?? null,
      };
    } catch {
      // Falha de rede numa consulta não é motivo para desistir: o celular pode
      // ter oscilado, e a resposta segue sendo produzida do outro lado.
      // A próxima volta do laço tenta de novo.
    }
  }

  return { resposta: '', erro: true, causa: 'demora' };
}

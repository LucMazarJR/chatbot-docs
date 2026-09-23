import { despachar } from './despachante';

const INTERVALO_MS = 30_000;

/** Cada gatilho tem o próprio intervalo; o relógio só confere quem está na hora. */
const INTERVALO_GATILHOS_MS = 60_000;

let iniciado = false;

/**
 * Dispara o despachante a cada 30 segundos.
 *
 * LÓGICA DO LUCIANO: dentro do próprio servidor do PWA, e não num fluxo do n8n.
 * Um fluxo precisaria ser importado, ativado e ter a credencial cadastrada à mão,
 * e importar pelo CLI desativa o fluxo em silêncio. Aqui não há nada a
 * configurar: o container sobe e os avisos começam a sair.
 *
 * Só roda onde há processo que fica de pé (o Docker). Na Vercel cada função
 * congela entre requisições, então um intervalo ali não dispararia nada: ver a
 * guarda em `instrumentation.ts`. Para um relógio de fora, existe
 * `POST /api/notificacoes/despachar`.
 */
export function iniciarRelogio(): void {
  if (iniciado) return;
  iniciado = true;

  const rodada = async () => {
    try {
      const resultado = await despachar();
      // Só registra quando houve trabalho: um log a cada 30 segundos dizendo
      // "nada" enterraria as linhas que importam.
      if (resultado.reivindicadas > 0) {
        console.log(`[despachante] ${JSON.stringify(resultado)}`);
      }
    } catch (erro) {
      console.error('[despachante] rodada falhou:', erro);
    }
  };

  // A primeira rodada espera o servidor terminar de subir e o banco conectar.
  setTimeout(rodada, 10_000).unref();
  setInterval(rodada, INTERVALO_MS).unref();

  // Os gatilhos só olham o relógio se algum estiver ligado: com a variável
  // vazia, nada do código deles nem chega a ser carregado.
  if (process.env.GATILHOS_ATIVOS?.trim()) {
    const gatilhos = async () => {
      try {
        const { rodarGatilhos } = await import('@/gatilhos/executor');
        await rodarGatilhos();
      } catch (erro) {
        console.error(`[gatilhos] rodada falhou: ${(erro as Error).message}`);
      }
    };
    setTimeout(gatilhos, 20_000).unref();
    setInterval(gatilhos, INTERVALO_GATILHOS_MS).unref();
  }
}

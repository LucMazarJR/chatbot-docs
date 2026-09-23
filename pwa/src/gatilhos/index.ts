import boasVindas from './boas-vindas';
import type { Gatilho } from './tipos';

/**
 * Todos os gatilhos que existem.
 *
 * Estar aqui não liga o gatilho: ele só roda quando o id está em
 * `GATILHOS_ATIVOS`. Gatilho novo é um arquivo nesta pasta e uma linha nesta
 * lista. O passo a passo está em docs/gatilhos-de-avisos.md.
 */
export const GATILHOS: Gatilho[] = [boasVindas];

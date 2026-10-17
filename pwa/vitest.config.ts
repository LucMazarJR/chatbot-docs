import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Testes de unidade, só para lógica pura: senha, regras de vínculo de conta,
 * decisões do despachante de avisos.
 *
 * Nada aqui fala com o Mongo ou com a rede. O comportamento de ponta a ponta é
 * conferido contra o ambiente real, que é onde os defeitos deste projeto
 * costumam aparecer.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

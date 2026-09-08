import type { NextConfig } from 'next';

const config: NextConfig = {
  // Gera .next/standalone com um servidor Node autocontido e só as dependências
  // realmente usadas. É o que permite a imagem final não carregar node_modules
  // inteiro — sem isto, o container do protótipo passa de 1 GB.
  output: 'standalone',

  // O service worker precisa ser sempre buscado da rede, senão o navegador
  // segura uma versão antiga e a atualização nunca chega ao participante.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default config;

import type { NextConfig } from 'next';

const config: NextConfig = {
  // `standalone` gera .next/standalone com um servidor Node autocontido e só as
  // dependências realmente usadas. É o que permite a imagem Docker não carregar
  // node_modules inteiro — sem isto, o container do protótipo passa de 1 GB.
  //
  // Mas NÃO pode valer na Vercel. Lá o build termina com um passo próprio
  // (`onBuildComplete`) que procura os arquivos de rastreio no formato padrão,
  // e o modo standalone não os produz nesse lugar. O deploy quebra com:
  //
  //   ENOENT: no such file or directory, open '.next/next-server.js.nft.json'
  //
  // A mensagem não menciona `output` nem `standalone`, então é fácil procurar o
  // problema no lugar errado. Mesma família da armadilha do NITRO_PRESET no
  // front do dashboard: o alvo do build precisa diferir entre Docker e a
  // plataforma. `VERCEL` é definida por eles em todo build lá.
  output: process.env.VERCEL ? undefined : 'standalone',

  /**
   * A versão B é HTML/CSS/JS puro, servido de `public/b/`.
   *
   * Ela foi desenhada assim por outra pessoa, e reescrevê-la em React antes de o
   * grupo escolher entre as duas seria refazer um trabalho que pode ser
   * descartado — e arriscaria alterar justamente o que está em avaliação. Só as
   * chamadas ao backend foram trocadas; o desenho está intacto.
   *
   * O Next serve `public/b/index.html` em `/b/index.html`, mas não em `/b`.
   * Esta reescrita faz a rota curta funcionar.
   */
  async rewrites() {
    return [{ source: '/b', destination: '/b/index.html' }];
  },

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

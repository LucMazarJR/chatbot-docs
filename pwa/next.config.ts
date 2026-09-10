import type { NextConfig } from 'next';

/**
 * Cabeçalhos de segurança.
 *
 * O protótipo guarda conversa sobre saúde de pessoas identificáveis pelo que
 * escrevem, e até aqui não mandava nenhum destes — qualquer site podia embutir
 * o chat num iframe e ler o que o participante digitava.
 *
 * A CSP permite `unsafe-inline` em script e estilo porque o Next injeta o
 * próprio bootstrap inline e o React insere estilos em tempo de execução;
 * apertar isso exigiria nonce por requisição. `data:` em `img-src` é o padrão de
 * fundo do chat, que é um SVG embutido no CSS.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const CABECALHOS_DE_SEGURANCA = [
  { key: 'Content-Security-Policy', value: CSP },
  // Redundante com `frame-ancestors`, mantido para navegadores antigos.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Sem isto, o endereço da conversa vaza no `Referer` ao clicar num link que a
  // resposta do agente tenha incluído.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

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

  async headers() {
    return [
      // O service worker precisa ser sempre buscado da rede, senão o navegador
      // segura uma versão antiga e a atualização nunca chega ao participante.
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      {
        source: '/:caminho*',
        headers: CABECALHOS_DE_SEGURANCA,
      },
    ];
  },
};

export default config;

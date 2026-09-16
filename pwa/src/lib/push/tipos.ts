/**
 * Um aparelho que aceitou receber avisos.
 *
 * Uma conta pode ter vários — o celular e o computador —, e cada um é uma
 * inscrição separada, com endpoint próprio no serviço de push do navegador.
 */
export type InscricaoPush = {
  /**
   * SHA-256 do endpoint.
   *
   * O endpoint identifica o aparelho de forma única, mas é longo demais para
   * servir de chave e carrega, em alguns navegadores, o id do aparelho no
   * serviço do Google ou da Apple. O hash dá unicidade sem espalhar isso pelos
   * índices e pelos recibos.
   */
  _id: string;
  usuarioId: string;
  endpoint: string;
  chaves: { p256dh: string; auth: string };
  userAgent: string;
  criadaEm: Date;
  atualizadaEm: Date;
  ultimoSucessoEm: Date | null;
  falhasSeguidas: number;
};

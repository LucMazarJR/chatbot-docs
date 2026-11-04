/**
 * Nome da segunda conexão Mongo.
 *
 * As conversas do protótipo vivem noutro banco (pwa_prototipo), não em
 * ministerio_saude. Os dois estão no mesmo cluster, mas são bancos distintos de
 * propósito: FAQ é conteúdo curado de produção, conversa de participante é dado
 * de validação, descartável. Misturar convidaria a um drop errado.
 *
 * Fica em arquivo próprio, e não no módulo, porque o service precisa dele para
 * o @InjectModel, e o módulo precisa do service. Deixar a constante no módulo
 * fecharia um ciclo de importação entre os dois.
 */
export const CONEXAO_PROTOTIPO = 'prototipo';

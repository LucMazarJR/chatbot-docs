/**
 * Token de injeção do cliente Redis.
 *
 * Em arquivo próprio, separado de `redis.module.ts`, pelo mesmo motivo de
 * `typed-config.service.ts`: o módulo dispara a validação do ambiente ao ser
 * carregado, e quem só precisa do token não deveria pagar por isso.
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

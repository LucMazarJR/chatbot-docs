import { SetMetadata } from '@nestjs/common';

import type { Area, Nivel } from '../../grupos/areas';

export const PERMITE_KEY = 'permite';
export const SO_MASTER_KEY = 'soMaster';

/** "conversas:ver", "faqs:editar"... Tipado: uma área que não existe não compila. */
export type Exigencia = `${Area}:${Nivel}`;

/**
 * Libera a rota para quem tem QUALQUER UMA das exigências.
 *
 * Mais de uma serve para telas que dependem de dado de outra área: o formulário
 * de FAQ precisa da lista de categorias, então `categorias:ver` ou
 * `faqs:editar` abrem a mesma consulta. O master passa sempre.
 */
export const Permite = (...exigencias: Exigencia[]) => SetMetadata(PERMITE_KEY, exigencias);

/** Só o master: mexer nos grupos muda o acesso de todo mundo. */
export const SoMaster = () => SetMetadata(SO_MASTER_KEY, true);

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Libera a rota do guard de autenticação.
 *
 * O padrão é o inverso: tudo protegido. Sem isso, esquecer de proteger uma
 * rota nova é um vazamento silencioso — com isso, esquecer de liberar dá um
 * 401 barulhento, que alguém percebe no mesmo dia.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

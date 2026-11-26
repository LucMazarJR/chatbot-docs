import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const POR_PAGINA_PADRAO = 20;
export const POR_PAGINA_MAXIMO = 100;

/**
 * `page` e `limit` da query, o mesmo par das FAQs e do Histórico.
 *
 * O `@Type` é obrigatório: a query chega como texto, e sem a conversão o
 * `@IsInt` recusa "2" e a página nunca sai da 1.
 */
export class PaginacaoQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(POR_PAGINA_MAXIMO)
    limit?: number;
}

export type Pagina = { page: number; limit: number; skip: number };

/** Valores válidos mesmo quando a chamada vem de dentro do back, sem o DTO. */
export function pagina(page?: number, limit?: number): Pagina {
    const p = Number.isInteger(page) && (page as number) > 0 ? (page as number) : 1;
    const l = Number.isInteger(limit) && (limit as number) > 0
        ? Math.min(limit as number, POR_PAGINA_MAXIMO)
        : POR_PAGINA_PADRAO;
    return { page: p, limit: l, skip: (p - 1) * l };
}

/** O formato de resposta que o front lê com `Paginated<T>`. */
export function paginado<T>(itens: T[], total: number, { page, limit }: Pagina) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { itens, total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

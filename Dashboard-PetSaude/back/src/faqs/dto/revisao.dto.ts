import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import type { FiltroRevisao } from '../revisao';

/**
 * A data vai como texto ("AAAA-MM-DD") e quem confere é `lerDataDeRevisao`,
 * que devolve a frase certa para data que não existe. `null` tira a revisão.
 */
export class CamposDeRevisaoDto {
    @IsOptional()
    @IsString()
    revisar_em?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(200, { message: 'O motivo da revisão pode ter até 200 caracteres.' })
    revisao_nota?: string | null;
}

/** "Continua valendo": a próxima data, ou null para não revisar mais. */
export class RevisarFaqDto extends CamposDeRevisaoDto { }

export class ListarRevisoesQueryDto {
    @IsOptional()
    @IsIn(['vencidas', 'proximas', 'todas'])
    situacao?: FiltroRevisao;

    @IsOptional()
    @IsIn(['minhas', 'todas'])
    escopo?: 'minhas' | 'todas';

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

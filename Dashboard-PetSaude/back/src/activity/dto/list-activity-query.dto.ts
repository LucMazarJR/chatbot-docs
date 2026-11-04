import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { TIPOS_ENTIDADE, type TipoEntidade } from '../schemas/activity.schema';

export class ListActivityQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 15;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    actorId?: string;

    @IsOptional()
    @IsIn(TIPOS_ENTIDADE)
    entityType?: TipoEntidade;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    entityId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(40)
    action?: string;

    @IsOptional()
    @IsIn(['sucesso', 'negado'])
    status?: 'sucesso' | 'negado';

    @IsOptional()
    @IsISO8601()
    de?: string;

    @IsOptional()
    @IsISO8601()
    ate?: string;
}

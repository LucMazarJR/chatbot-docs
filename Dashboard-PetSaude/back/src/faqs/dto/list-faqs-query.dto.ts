import { Type } from 'class-transformer';
import {
    IsIn,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

// LÓGICA DO LUCIANO: parâmetros de querystring chegam como texto. Sem o
// @Type(() => Number), o @IsInt() rejeita "2" e a paginação nunca sai da
// primeira página.
export class ListFaqsQueryDto {
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
    limit?: number = 20;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    category?: string;

    @IsOptional()
    @IsString()
    @MaxLength(60)
    tag?: string;

    /** Casa com quem criou ou com quem alterou por ultimo. */
    @IsOptional()
    @IsString()
    @MaxLength(120)
    autor?: string;

    @IsOptional()
    @IsIn(['manual', 'importada', 'drive'])
    origem?: 'manual' | 'importada' | 'drive';

    @IsOptional()
    @IsIn(['ativas', 'inativas', 'todas'])
    situacao?: 'ativas' | 'inativas' | 'todas';

    @IsOptional()
    @IsISO8601()
    de?: string;

    @IsOptional()
    @IsISO8601()
    ate?: string;
}

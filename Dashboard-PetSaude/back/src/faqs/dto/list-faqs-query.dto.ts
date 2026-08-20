import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
}

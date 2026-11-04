import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AtualizarCategoriaDto {
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(60)
    nome?: string;

    @IsOptional()
    @IsString()
    @MaxLength(300)
    descricao?: string;

    @IsOptional()
    @IsBoolean()
    ativa?: boolean;
}

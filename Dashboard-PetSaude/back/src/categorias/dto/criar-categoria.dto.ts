import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CriarCategoriaDto {
    @IsString()
    @MinLength(2)
    @MaxLength(60)
    nome: string;

    @IsOptional()
    @IsString()
    @MaxLength(300)
    descricao?: string;
}
